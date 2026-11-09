# Layout engine requirements

Rules are agreed. Priority when rules conflict: no overlap (hard), couple integrity (1, 5, 6), sides (4), birth order (2), parents centred (8), compactness. A husband's siblings therefore all sit left of his couple and a wife's all right of it, out of birth order if needed.

## Rules

1. In a couple the man is on the left. Unknown gender counts as woman.
2. Children of a family are ordered left to right by birth date; without a date, by the order they were added.
3. A married daughter leaves her sibling row when her husband has parents in the tree; she is drawn as his wife next to him. Her parents' line still connects to her.
4. At every couple, the husband's relatives (parents, siblings and their descendants) are on the left of the couple and the wife's relatives on the right.
5. Multiple marriages follow rule 1: a man's wives are all to his right, in marriage order; a woman's husbands are all to her left. Each marriage's children hang under that marriage's own line.
6. A husband without parents in the tree still takes the slot left of his wife, who stays in her sibling row.
7. Generations are rows. Every person sits in the row of their generation; spouses share a row; in-law parents sit one row above their child regardless of their own ancestry depth.
8. Parents are centred over their children when rules 1 to 7 leave the choice free. A parent couple's marriage point is the anchor; a single-parent family anchors on the parent card.
9. Each person appears once. Cousin marriages and other cycles are drawn with a long connector, placed on the side they are reached from first by rules 4 and 5.
10. For an in-law spouse, their parents are added above them, plus their siblings if present in the file, on the in-law's side per rule 4.
11. A child with one known parent keeps the line to that parent; a person with no parents in the file starts a new top-row group.
12. Twins hang from one point in birth order; identical twins get the bar. Pregnancies, miscarriages and stillbirths stay in the child row in order.
13. Disconnected groups are placed left to right in file creation order with a fixed gap, after the group that contains the index person.
14. Collapsed branches are excluded from layout as if absent; the collapsed person keeps their place.
15. Connectors are orthogonal. Child buses run midway between rows with lanes so lines do not merge; a couple's line joins the two cards; non-adjacent couples use a stepped line below the row; lines never pass through a card.
16. Same data gives the same picture; adding or removing one person moves others as little as the rules allow.
17. Compact mode changes card size and gaps only, never ordering.
18. The index person is only highlighted; the layout does not anchor on them.
19. 500 people lay out in well under 100 ms so every edit re-lays out synchronously.

20. Rule 2 is always in force. The "fewer crossings" sibling mode is removed.

# Engine design

Pure function, no DOM: `layout(model, options) -> { positions, rows }`, where `model` is people, families and the collapsed set, and `options` is card size and gaps. The renderer keeps drawing connectors from positions as today.

## Phases

1. **Visibility.** Drop collapsed descendants and their spouses, then in-laws whose every connection is gone (rule 14).
2. **Rows.** Assign a generation to every visible person: child = parent + 1, spouses equal. Solved per connected component by longest-path relaxation; inconsistent cycles take the deeper rank (rule 7).
3. **Units.** Group spouses in the same row into one unit. Members are ordered men first, then women; among several wives or husbands, by marriage order. A marriage between non-adjacent members gets a stepped connector (rules 1, 5, 6).
4. **Placement tree.** Every unit gets: child groups below, one per marriage in marriage order, children in birth order (rule 2), minus daughters pulled to a husband with parents (rule 3); and ancestor blocks above, the husband's parents' unit on the left side and the wife's on the right (rules 4, 10). A person reached twice is kept at the first place and linked (rule 9).
5. **Order.** One depth-first walk over the placement tree produces a single global sequence of units: for a unit, first its left ancestor block, then the unit itself, then its right ancestor block, then its child groups. Each row's left-to-right order is this sequence filtered to the row. Because the order comes from data, not from coordinates, it is deterministic and stable (rule 16).
6. **Coordinates.** For each row in order, place units left to right at their preferred x, pushing right only as far as the gap to the previous unit demands. Preferred x is the centre over the unit's children, or beside its anchor for ancestor blocks (rule 8). Sweep down then up a few times until nothing moves; the row order is never changed by this pass, so rules 1 to 7 cannot be violated by it. No overlap is guaranteed by construction.
7. **Components.** Lay out each connected component separately, then line them up left to right with a fixed gap, the index person's component first (rule 13).

## What stays

The renderer, connector drawing with lanes, steps and crossing styles, compact mode, collapsing UI, badges, search and the relationship bar are unchanged; only `computeLayout` is replaced.

## Tests

- Node unit tests on the pure function with small fixtures, one per rule: man-left, birth order, pulled daughter, sides at a couple, multiple marriages, in-law husband, generation rows, twins, collapsed, components, determinism.
- The anonymized wide tree as a regression fixture: no overlaps, every rule checked programmatically, width and total connector length recorded so regressions are visible.
- Existing Playwright suite for rendering and interaction.
