import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Store, M } from './store.mjs';

const PERSON_FIELDS = {
  name: z.string().optional(),
  birthName: z.string().optional().describe('Name at birth, for example a maiden name'),
  gender: z.enum(['m', 'f', '']).optional(),
  birth: z.string().optional().describe('YYYY, YYYY-MM or YYYY-MM-DD; empty string to clear'),
  death: z.string().optional().describe('YYYY, YYYY-MM or YYYY-MM-DD; setting it marks the person as deceased'),
  alive: z.boolean().optional(),
  birthplace: z.string().optional(),
  profession: z.string().optional(),
  notes: z.string().optional(),
  fate: z.enum(['', 'pregnancy', 'miscarriage', 'abortion', 'stillborn', 'unknown']).optional(),
  orientation: z.enum(['', 'gay', 'bi']).optional(),
  trans: z.enum(['', 'mtf', 'ftm']).optional(),
  migration: z.enum(['', '1', '2']).optional(),
  pet: z.boolean().optional(),
  therapy: z.boolean().optional(),
  secret: z.boolean().optional(),
  smoker: z.boolean().optional(),
  overweight: z.boolean().optional(),
  language: z.boolean().optional(),
  illness: z.enum(['', 'active', 'recovered']).optional(),
  substance: z.enum(['', 'active', 'suspected', 'recovered']).optional(),
  lineEnded: z.boolean().optional().describe('No descendants, shown as a line end mark'),
};
const writeOpts = {
  dryRun: z.boolean().optional().describe('Preview the change without writing the file'),
  force: z.boolean().optional().describe('Write even if the file changed on disk since it was read'),
};

const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });

export function createServer(store = new Store()) {
  const server = new McpServer({ name: 'family-tree', version: '1.0.0' });
  const guard =
    (fn) =>
    async (...a) => {
      try {
        return text(await fn(...a));
      } catch (e) {
        return fail(e.message);
      }
    };
  const applyFields = (p, f) => {
    for (const [k, v] of Object.entries(f)) if (v !== undefined && k in PERSON_FIELDS) p[k] = v;
    if (f.death) p.alive = false;
    if (f.alive === true) p.death = '';
  };

  server.registerTool(
    'open_tree',
    {
      description:
        'Open a .ftree (or exported .json) file. Must be called before anything else unless a path was given on the command line.',
      inputSchema: {
        path: z.string(),
        create: z.boolean().optional().describe('Create an empty tree if the file does not exist'),
      },
    },
    guard(async ({ path, create }) => {
      try {
        return await store.open(path);
      } catch (e) {
        if (create && e.code === 'ENOENT') return store.create(path);
        throw e;
      }
    }),
  );

  server.registerTool(
    'tree_summary',
    { description: 'Counts and the index person of the open tree.', inputSchema: {} },
    guard(async () => {
      store.requireOpen();
      return store.summary();
    }),
  );

  server.registerTool(
    'tree_outline',
    {
      description: 'Indented text outline of the whole tree: roots, spouses (⚭) and children by birth order, with ids.',
      inputSchema: {},
    },
    guard(async () => {
      store.requireOpen();
      return store.outline();
    }),
  );

  server.registerTool(
    'list_people',
    {
      description: 'List people, optionally filtered by a case-insensitive substring of name or birth name.',
      inputSchema: { query: z.string().optional(), limit: z.number().int().positive().optional() },
    },
    guard(async ({ query, limit = 100 }) => {
      store.requireOpen();
      const q = (query || '').toLowerCase();
      return M.people()
        .filter((p) => !q || `${p.name} ${p.birthName}`.toLowerCase().includes(q))
        .slice(0, limit)
        .map((p) => ({
          id: p.id,
          name: p.name,
          birthName: p.birthName,
          gender: p.gender,
          birth: p.birth,
          death: p.death,
          alive: p.alive,
        }));
    }),
  );

  server.registerTool(
    'get_person',
    {
      description: 'Full record of one person with parents, spouses, children, siblings and marriages.',
      inputSchema: { person: z.string().describe('Person id, or an exact unique name') },
    },
    guard(async ({ person }) => {
      store.requireOpen();
      return store.view(store.resolve(person));
    }),
  );

  server.registerTool(
    'add_person',
    {
      description:
        'Add an unconnected person. Prefer add_relative when the person belongs to someone already in the tree.',
      inputSchema: { ...PERSON_FIELDS, ...writeOpts },
    },
    guard(async ({ dryRun, force, ...fields }) =>
      store.mutate(
        () => {
          const p = M.newPerson();
          applyFields(p, fields);
          return store.view(p.id);
        },
        { dryRun, force },
      ),
    ),
  );

  server.registerTool(
    'update_person',
    {
      description: 'Change fields of an existing person. Only the fields given are changed.',
      inputSchema: { person: z.string(), ...PERSON_FIELDS, ...writeOpts },
    },
    guard(async ({ person, dryRun, force, ...fields }) =>
      store.mutate(
        () => {
          const id = store.resolve(person);
          applyFields(store.person(id), fields);
          return store.view(id);
        },
        { dryRun, force },
      ),
    ),
  );

  server.registerTool(
    'add_relative',
    {
      description:
        'Create a new person as parent, child, sibling or spouse of an existing one and fill in their fields. For a child of a specific marriage pass familyId (see get_person.marriages).',
      inputSchema: {
        person: z.string(),
        relation: z.enum(['parent', 'child', 'sibling', 'spouse']),
        familyId: z.string().optional(),
        replaceParent: z.string().optional().describe('When both parents exist, id of the parent to replace'),
        ...PERSON_FIELDS,
        ...writeOpts,
      },
    },
    guard(async ({ person, relation, familyId, replaceParent, dryRun, force, ...fields }) =>
      store.mutate(
        () => {
          const id = store.resolve(person);
          let p;
          if (relation === 'parent') {
            p = M.addParent(id, replaceParent);
            if (!p)
              throw new Error(
                'This person already has two parents; pass replaceParent with the id of the one to replace.',
              );
          } else if (relation === 'child') p = M.addChild(id, familyId);
          else if (relation === 'spouse') p = M.addSpouse(id);
          else p = M.addSibling(id, 'right');
          applyFields(p, fields);
          return store.view(p.id);
        },
        { dryRun, force },
      ),
    ),
  );

  server.registerTool(
    'link_people',
    {
      description:
        'Connect two existing people: as spouses, or one as child of the other. Refuses cycles and duplicates.',
      inputSchema: {
        a: z.string(),
        b: z.string(),
        relation: z
          .enum(['spouse', 'child_of', 'parent_of'])
          .describe('spouse: a ⚭ b; child_of: a is a child of b; parent_of: a is a parent of b'),
        familyId: z.string().optional().describe('Marriage of the parent that the child joins'),
        replaceParent: z
          .string()
          .optional()
          .describe('If the child already has two parents, id of the parent to replace'),
        ...writeOpts,
      },
    },
    guard(async ({ a, b, relation, familyId, replaceParent, dryRun, force }) =>
      store.mutate(
        () => {
          const ia = store.resolve(a),
            ib = store.resolve(b);
          let err;
          if (relation === 'spouse') err = M.linkSpouse(ia, ib);
          else {
            const [parent, child] = relation === 'child_of' ? [ib, ia] : [ia, ib];
            if (replaceParent) {
              M.replaceParent(child, replaceParent, parent);
              err = null;
            } else err = M.linkChild(parent, child, familyId);
          }
          if (Array.isArray(err))
            throw new Error(
              'The child already has two parents. Pass replaceParent with one of: ' +
                M.parentsOf(relation === 'child_of' ? ia : ib).join(', '),
            );
          if (err) throw new Error(err);
          return { a: store.view(ia), b: store.view(ib) };
        },
        { dryRun, force },
      ),
    ),
  );

  server.registerTool(
    'set_marriage',
    {
      description: 'Set dates, status or order of a marriage (familyId from get_person.marriages).',
      inputSchema: {
        familyId: z.string(),
        married: z.string().optional(),
        ended: z.string().optional(),
        status: z
          .enum([
            'married',
            'partners',
            'separated',
            'partners_sep',
            'affair',
            'divorced',
            'reconciled_sep',
            'reconciled_div',
          ])
          .optional(),
        move: z.enum(['earlier', 'later']).optional().describe('Reorder among a person’s marriages'),
        ...writeOpts,
      },
    },
    guard(async ({ familyId, married, ended, status, move, dryRun, force }) =>
      store.mutate(
        () => {
          const f = M.fam(familyId);
          if (!f) throw new Error(`Unknown family id: ${familyId}`);
          if (married !== undefined) f.married = married;
          if (ended !== undefined) f.ended = ended;
          if (status !== undefined) f.status = status;
          if (move) M.moveMarriage(familyId, move === 'earlier' ? -1 : 1);
          return { ...f, parents: f.parents.map((x) => ({ id: x, name: M.state.people[x]?.name })) };
        },
        { dryRun, force },
      ),
    ),
  );

  server.registerTool(
    'set_child_kind',
    {
      description:
        'Mark a child as biological, adopted or foster, set a twin, or move an undated child earlier or later among siblings.',
      inputSchema: {
        person: z.string(),
        type: z.enum(['bio', 'adopted', 'foster']).optional(),
        twin: z.string().optional().describe('Sibling id, or empty string to clear'),
        identical: z.boolean().optional(),
        move: z.enum(['earlier', 'later']).optional(),
        ...writeOpts,
      },
    },
    guard(async ({ person, type, twin, identical, move, dryRun, force }) =>
      store.mutate(
        () => {
          const id = store.resolve(person);
          const patch = {};
          if (type !== undefined) patch.type = type;
          if (twin !== undefined) patch.twin = twin ? store.resolve(twin) : '';
          if (identical !== undefined) patch.identical = identical;
          if (Object.keys(patch).length) M.setKind(id, patch);
          if (move) M.moveChild(id, move === 'earlier' ? -1 : 1);
          return store.view(id);
        },
        { dryRun, force },
      ),
    ),
  );

  server.registerTool(
    'add_relation',
    {
      description: 'Add an emotional relationship line between two people, or put them in one household.',
      inputSchema: {
        a: z.string(),
        b: z.string(),
        type: z.enum([
          'close',
          'fused',
          'positive',
          'spiritual',
          'conflict',
          'close_hostile',
          'distant',
          'cutoff',
          'cutoff_repaired',
          'focused',
          'neg_focus',
          'caregiver',
          'abuse_physical',
          'abuse_emotional',
          'abuse_sexual',
          'household',
        ]),
        label: z.string().optional(),
        ...writeOpts,
      },
    },
    guard(async ({ a, b, type, label, dryRun, force }) =>
      store.mutate(
        () => {
          const ia = store.resolve(a),
            ib = store.resolve(b);
          const err = type === 'household' ? M.joinHousehold(ia, ib) : M.addRelation(ia, ib, type);
          if (err) throw new Error(err);
          if (label && type !== 'household') M.state.relations[M.state.relations.length - 1].label = label;
          return type === 'household' ? M.state.households : M.state.relations;
        },
        { dryRun, force },
      ),
    ),
  );

  server.registerTool(
    'detach_from_parents',
    {
      description: 'Remove a person from their parents\u2019 family without deleting anyone; siblings are unaffected.',
      inputSchema: { person: z.string(), ...writeOpts },
    },
    guard(async ({ person, dryRun, force }) =>
      store.mutate(
        () => {
          const id = store.resolve(person);
          M.detachFromParents(id);
          return store.view(id);
        },
        { dryRun, force },
      ),
    ),
  );

  server.registerTool(
    'remove_person',
    {
      description: 'Delete a person and detach them from every family and relation.',
      inputSchema: { person: z.string(), ...writeOpts },
    },
    guard(async ({ person, dryRun, force }) =>
      store.mutate(
        () => {
          const id = store.resolve(person);
          const name = M.state.people[id].name;
          M.deletePerson(id);
          return { removed: { id, name }, ...store.summary() };
        },
        { dryRun, force },
      ),
    ),
  );

  server.registerTool(
    'set_index_person',
    {
      description: 'Mark the person the tree is centred on, or clear it with an empty string.',
      inputSchema: { person: z.string(), ...writeOpts },
    },
    guard(async ({ person, dryRun, force }) =>
      store.mutate(
        () => {
          M.state.indexPerson = person ? store.resolve(person) : null;
          return store.summary();
        },
        { dryRun, force },
      ),
    ),
  );

  return server;
}
