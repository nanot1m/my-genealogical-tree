# Layout engine requirements

Draft, in progress. Numbered rules are agreed and listed in priority order: when two rules conflict, the earlier one wins. Cards never overlap; that is a hard constraint above all rules.

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

## Open

- Does the "fewer crossings" sibling mode survive, or is rule 2 always strict?
