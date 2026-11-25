# Course and scene format

A course folder holds `course.json` and one scene per chapter. `build_course.py` checks everything below
and lists every problem at once. Working example: `examples/how-it-works/` in the repository.

## course.json (`gbauto.architecture-course.v1`)

| Field | Meaning |
|---|---|
| `id` | Lower-case slug. Reading progress is stored in the browser under this id |
| `title`, `intro` | Page title and description |
| `home_repo` | Repository name whose paths are shown without a prefix |
| `chapters` | `[{"title", "tone", "scene": "scenes/x.json"}]`. Scenes stay inside the course folder |
| `about` | Paragraphs for the About box. Say what the course does not prove |
| `kinds` | Optional legend words: `{"req": "request", "ok": "...", "bad": "...", "sync": "..."}` |

## Scene (`gbauto.arch-scene.v1`)

One scene is one map. Its `tracks` are the lessons, so the normal path and its failures share a map.

- `zones`: `{"id", "title", "x": [from, to], "y": [from, to]}`. A floor for a machine, network or service.
  Leave about 2.5 grid units between the smallest `y` and the first node: the zone name is drawn there.
- `nodes`: `{"id", "label", "sub", "x", "y", "shape", "tone", "icon"}`.
  Shapes: `block` (a program), `disk` (a store), `slab` (a person, device or outside service).
  Tones: `terracotta amber red blue green stone`. Icons are listed in `ICON` in `assets/engine.js`.
- `edges`: `{"id", "from", "to"}`, plus `via` (corner points) or `pts` (the whole route) to bend. Keep
  every segment parallel to x or y.

Grid: x runs down-right, y runs down-left. To go right on screen, alternate +x and -y. Put neighbours
3.5 or more apart so labels clear the next block.

## Lesson (an item of `tracks`)

| Field | Meaning |
|---|---|
| `id`, `label`, `subtitle` | Slug for links, title, one line |
| `tags` | Optional short pills. The step count is added for you. Do not invent reading times |
| `learn` | 2 to 6 of `{"text", "step"}`; ticked when that step is opened |
| `metrics` | 3 to 5 of `{"id", "label"}`; steps give the values |
| `steps` | 2 to 14 |

## Step

| Field | Meaning |
|---|---|
| `short` | One or two words for the timeline |
| `phase` | `Setup`, `Problem`, `Detail`, `Solution` or `Recap` |
| `title` | A sentence that says what happens |
| `body` | One string, or a list of up to two short paragraphs |
| `focus` | Node ids in view, or `"all"`. The camera frames them |
| `hops` | Packets in order: `{"e": edge, "r": 1 for reverse, "kind", "label", "fail": 1 to stop it}` |
| `tags` | `{"node": {"t": "text", "tone"}}`: a status above a node in focus |
| `relabel` | `{"node": {"label", "sub"}}` for this step only |
| `metrics` | `{"id": "value"}` or `{"id": {"v": "value", "tone": "good" or "bad"}}` |
| `idea` | `{"kind": "idea", "tip", "warn" or "next", "text"}` |
| `changes` | `[{"op": "add", "mod" or "del", "text"}]` |
| `sources` | Required. `[{"repo", "path", "anchor"}]`. `anchor` is exact text on the line that proves the step |

Packet kinds: `req` request, `ok` reply or pass, `bad` refused or failed, `sync` background.
