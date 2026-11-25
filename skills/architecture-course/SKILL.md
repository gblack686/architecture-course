---
name: architecture-course
description: "Build an animated, step-through course page that explains how a system works: lesson outline on the left, isometric diagram with moving packets and a step timeline in the middle, explanation on the right. Every step is tied to a real line of code. Use when someone asks for an architecture walkthrough, an animated or interactive system diagram, a system design explainer, or 'show how X works step by step'."
license: MIT
metadata:
  version: "1.0.1"
---

# Architecture course

One course folder in, one standalone `index.html` out. The engine, page and checks are fixed; a new
architecture is a new scene file. Paths below are relative to this skill's folder.

## Rules

- **Draw what the code does, not what someone remembers.** Read the code path first. If the request
  describes a path that does not exist, say so and draw the real one.
- **Every step needs a source** whose anchor text is on the line that proves it. No source, no step.
- **Show at least one failure** as its own lesson: who is refused, what breaks, what the person sees.
- **Measured numbers only.** Give the date and say when it was a single measurement. No guessed reading times.
- **No secrets, private addresses or client text** in a scene. The page embeds everything in it.
- **Only use artwork you have the right to use.** Do not paste another site's drawings, styles or text.

## Steps

1. **Find the real path.** Search the code, deployment notes and records. List the hops in order, each
   check along the way, and each way it can fail. Note anything never seen working.
2. **Write the course**: a folder with `course.json` plus `scenes/*.json`. Format:
   [references/course-format.md](references/course-format.md). Aim for 8 to 12 steps on the normal path
   and 2 on each failure.
3. **Build.** It stops on a missing file, a missing anchor, or a step that names something not drawn.

   ```bash
   python scripts/build_course.py COURSE_DIR --repo NAME=PATH[@REV]
   ```

   Give one `--repo` for every git repository the steps cite. Without `@REV` it reads the last commit,
   so uncommitted changes are not seen.
4. **Check in a browser.** Every step is tested at desktop, tablet and phone size, in both themes and
   with reduced motion. Needs Python Playwright.

   ```bash
   python scripts/check_course.py COURSE_DIR/index.html --shots TEMP_DIR --every-step
   ```

5. **Look at the screenshots.** The checks catch overlap, clipping, contrast and lost packets. They do
   not know whether the story is right.
6. **Open `index.html`** and say what the page does not prove.

## Fixing a failed check

| Message | Fix |
|---|---|
| label over another label or icon | Move the nodes 0.5 to 1 grid unit apart, or shorten the label |
| label outside | Fewer nodes in that step's `focus` |
| anchor not found | The code changed. Reread it; the step may now be wrong, not just the anchor |
| clipped text | Shorten `short`, `title` or a chip value |
| packet stays on screen | Add the edge's two nodes to `focus` |

## Files

| File | What it is |
|---|---|
| `assets/engine.js` | Draws a scene and moves it from step to step. No dependencies |
| `assets/page.js`, `page.css`, `page.html` | The course page around it |
| `scripts/build_course.py` | Validates, resolves code lines, writes the page. Standard library and git |
| `scripts/check_course.py` | Browser checks. Needs Python Playwright |
| `references/course-format.md` | Every field of a course, lesson and step |

Fonts load from Google Fonts. Offline, the page falls back to Georgia and Segoe UI.
