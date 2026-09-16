"""Rebuild table rows from PDF word coordinates.

Both source PDFs defeat ``page.extract_tables()`` in the same way: their tables
are striped, so only shaded rows carry cell rectangles and the rest collapse into
a single cell. Cells also wrap vertically, so one logical row spans several text
lines and a naive line-by-line read interleaves them.

The fix used throughout this project: pick an anchor word per row (the serial
number or drug code in the first column), then attach every other word to the
anchor nearest to it vertically. Rows are far enough apart, and wrapped lines
close enough to their own anchor, that the nearest anchor is unambiguous.

``max_row_dy`` is the cutoff beyond which a word belongs to no row at all -- page
headers, footers, captions and body prose. It must be smaller than half the row
pitch, and is passed per table because the two PDFs have very different pitches
(the survey ~28.8pt, the indent ~17pt).
"""

from __future__ import annotations

import re
from bisect import bisect_right
from typing import Any

# (column name, left edge in PDF points). A word belongs to the last column whose
# left edge it is at or past.
ColumnSpec = list[tuple[str, float]]

_LEFT_EDGE_TOLERANCE = 1.0


def horizontal_rules(page: Any, min_width: float, merge_within: float = 1.0) -> list[float]:
    """Return the y positions of full-width horizontal rules on a page.

    A striped table draws a filled rectangle behind alternate rows, and each
    rectangle contributes a full-width edge at its top and bottom. Taken together
    those edges partition the page into exactly the document's own rows -- which
    beats inferring row extents from where the text happens to sit.

    Edges within ``merge_within`` points are collapsed, because a rectangle's fill
    and its border are reported at very slightly different positions.
    """
    ys = sorted(
        {
            round(e["top"], 1)
            for e in page.edges
            if e["orientation"] == "h" and (e["x1"] - e["x0"]) >= min_width
        }
    )
    merged: list[float] = []
    for y in ys:
        if merged and y - merged[-1] <= merge_within:
            continue
        merged.append(y)
    return merged


def column_of(x0: float, columns: ColumnSpec) -> str | None:
    """Return the column a word starting at ``x0`` belongs to, or None if left of all."""
    found = None
    for name, left in columns:
        if x0 >= left - _LEFT_EDGE_TOLERANCE:
            found = name
    return found


def assemble_rows(
    words: list[dict[str, Any]],
    columns: ColumnSpec,
    anchor_pattern: re.Pattern[str],
    max_row_dy: float | None = None,
    band_up_tolerance: float | None = None,
    row_boundaries: list[float] | None = None,
) -> list[dict[str, str]]:
    """Group positioned words into logical rows.

    Two assignment rules are available, because the two source PDFs lay their rows
    out differently. Exactly one must be given.

    ``max_row_dy`` -- *nearest anchor*. Each word joins the anchor closest to it
    vertically, and a word further than ``max_row_dy`` from every anchor belongs to
    no row (page furniture). Correct when cells are centred on their anchor, as in
    the survey's tables, where a wrapped line sits symmetrically above and below.

    ``row_boundaries`` -- *ruled rows*. Explicit y positions partition the page and
    each word falls in exactly one band; bands holding an anchor become rows, and
    anything outside the outermost boundaries (headers, footers) is dropped. This
    is the most reliable rule when the document draws its own row separators, and
    is what the indent uses: its rows vary so much in height that neither of the
    rules below can place a tall cell's outermost lines correctly.

    ``band_up_tolerance`` -- *bands*. Anchor *i* owns everything from
    ``anchor[i].top - band_up_tolerance`` up to where anchor *i+1*'s band begins.
    Correct when a tall cell grows downward from its anchor rather than around it,
    as in the indent: there a long drug name can end up nearer the *next* row's
    anchor than its own, and nearest-anchor silently moves it into the wrong row.
    The tolerance covers cells that are centred and so start slightly above their
    anchor. Bands have no lower cutoff, so an arbitrarily tall row keeps all of its
    lines -- filter page headers and footers out of ``words`` before calling.

    Args:
        words: pdfplumber ``extract_words()`` output for one page.
        columns: column names with their left edges, left to right.
        anchor_pattern: matches the first-column value that starts a row.
        max_row_dy: cutoff for nearest-anchor assignment.
        band_up_tolerance: how far above its anchor a band starts.

    Returns:
        One dict per row, with every column present (empty string if absent).
        Words within a cell are joined in reading order (top, then left).
    """
    if len(columns) < 2:
        raise ValueError("need at least two columns to locate the anchor column")
    given = [max_row_dy, band_up_tolerance, row_boundaries]
    if sum(x is not None for x in given) != 1:
        raise ValueError(
            "pass exactly one of max_row_dy, band_up_tolerance or row_boundaries"
        )

    first_col, second_col_left = columns[0][0], columns[1][1]
    anchors = [
        w for w in words if w["x0"] < second_col_left and anchor_pattern.match(w["text"])
    ]
    if not anchors:
        return []
    anchors.sort(key=lambda w: w["top"])
    anchor_tops = [a["top"] for a in anchors]

    buckets: list[dict[str, list[tuple[float, float, str]]]] = [
        {name: [] for name, _ in columns} for _ in anchors
    ]

    if row_boundaries is not None:
        # Map each boundary-delimited band to the anchor sitting inside it.
        band_of_anchor = [bisect_right(row_boundaries, top) - 1 for top in anchor_tops]
        anchor_of_band = {band: i for i, band in enumerate(band_of_anchor)}
    if band_up_tolerance is not None:
        band_starts = [top - band_up_tolerance for top in anchor_tops]

    for w in words:
        col = column_of(w["x0"], columns)
        if col is None:
            continue
        if row_boundaries is not None:
            band = bisect_right(row_boundaries, w["top"]) - 1
            if band < 0 or band >= len(row_boundaries) - 1:
                continue  # outside the ruled area: page header or footer
            idx = anchor_of_band.get(band, -1)
            if idx < 0:
                continue  # a band with no anchor holds no row
        elif band_up_tolerance is not None:
            if w["top"] < band_starts[0]:
                continue  # above the first row on the page
            idx = bisect_right(band_starts, w["top"]) - 1
        else:
            idx = min(range(len(anchors)), key=lambda i: abs(anchor_tops[i] - w["top"]))
            if abs(anchor_tops[idx] - w["top"]) > max_row_dy:
                continue
        # The anchor word itself always belongs to the first column, even if its
        # left edge would place it elsewhere.
        if w is anchors[idx]:
            col = first_col
        buckets[idx][col].append((w["top"], w["x0"], w["text"]))

    rows = []
    for bucket in buckets:
        rows.append(
            {name: " ".join(p[2] for p in sorted(bucket[name])).strip() for name, _ in columns}
        )
    return rows


def split_straddling_words(
    words: list[dict[str, Any]],
    chars: list[dict[str, Any]],
    columns: ColumnSpec,
    tolerance: float = 0.5,
) -> list[dict[str, Any]]:
    """Split words that cross a column boundary, using character positions.

    A PDF text layer sometimes emits two adjacent cells as one token when the gap
    between them carries no space character -- the indent does this with
    ``'AntioxytocicsAvailable'``, gluing a therapeutic category to the PHC column's
    "Available". Assigning that token by its left edge silently loses the
    availability value.

    Each straddling word is re-split at the boundary using its own characters, so
    the split lands where the glyphs actually are rather than at a guessed
    midpoint. A word whose characters cannot be matched confidently is returned
    untouched -- better a known-imperfect row than a silently mangled one.
    """
    boundaries = [left for _, left in columns[1:]]
    out: list[dict[str, Any]] = []

    for w in words:
        crossed = [b for b in boundaries if w["x0"] < b < w["x1"]]
        if not crossed:
            out.append(w)
            continue

        own = sorted(
            (
                c
                for c in chars
                if c["x0"] >= w["x0"] - tolerance
                and c["x1"] <= w["x1"] + tolerance
                and abs(c["top"] - w["top"]) <= tolerance
            ),
            key=lambda c: c["x0"],
        )
        if "".join(c["text"] for c in own) != w["text"]:
            out.append(w)  # could not reconstruct the word from chars; leave it alone
            continue

        runs: list[tuple[str | None, list[dict[str, Any]]]] = []
        for c in own:
            col = column_of(c["x0"], columns)
            if runs and runs[-1][0] == col:
                runs[-1][1].append(c)
            else:
                runs.append((col, [c]))

        for _, cs in runs:
            out.append(
                {
                    "text": "".join(c["text"] for c in cs),
                    "x0": cs[0]["x0"],
                    "x1": cs[-1]["x1"],
                    "top": w["top"],
                }
            )
    return out
