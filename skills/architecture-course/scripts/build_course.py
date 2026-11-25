#!/usr/bin/env python3
"""Build one standalone architecture course page from course.json and its scenes.

Standard library only. Every step cites code by an anchor string; the build finds that
string in the named repository at the named commit and records the line. A missing file,
a missing anchor or a step that names something undrawn stops the build.

    python build_course.py COURSE_DIR --repo NAME=PATH[@REV] [--repo ...] [--out FILE]
"""
from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

SKILL = Path(__file__).resolve().parents[1]
ASSETS = SKILL / "assets"
COURSE_SCHEMA = "gbauto.architecture-course.v1"
SCENE_SCHEMA = "gbauto.arch-scene.v1"
SHAPES = {"block", "disk", "slab"}
TONES = {"terracotta", "amber", "red", "blue", "green", "stone"}
KINDS = {"req", "ok", "bad", "sync"}
NOTES = {"idea", "tip", "warn", "next"}
OPS = {"add", "mod", "del"}
PHASES = {"Setup", "Problem", "Solution", "Detail", "Recap"}
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


class CourseError(ValueError):
    """The course cannot be built; the message names every problem found."""


def icons() -> set[str]:
    block = re.search(r"var ICON = \{(.*?)\n  \};", (ASSETS / "engine.js").read_text(encoding="utf-8"), re.S)
    return set(re.findall(r"(\w+): 'M", block.group(1))) if block else set()


def check_scene(scene: dict[str, Any]) -> list[str]:
    """Every structural problem in a scene; empty when it can be drawn."""
    bad: list[str] = []
    if scene.get("schema") != SCENE_SCHEMA:
        bad.append(f"schema must be {SCENE_SCHEMA}")
    for name in ("id", "nodes", "edges", "zones", "tracks"):
        if name not in scene:
            return bad + [f"missing {name}"]
    if not SLUG.match(str(scene["id"])):
        bad.append(f"scene id {scene['id']!r} must be lower-case letters, digits and hyphens")
    known_icons = icons()
    nodes: set[str] = set()
    for n in scene["nodes"]:
        if n["id"] in nodes:
            bad.append(f"node {n['id']}: duplicate id")
        nodes.add(n["id"])
        for key, allowed in (("shape", SHAPES), ("tone", TONES), ("icon", known_icons)):
            if n.get(key) not in allowed:
                bad.append(f"node {n['id']}: {key} {n.get(key)!r} is not one of {', '.join(sorted(allowed))}")
    edges: dict[str, dict[str, Any]] = {}
    for e in scene["edges"]:
        if e["id"] in edges:
            bad.append(f"edge {e['id']}: duplicate id")
        edges[e["id"]] = e
        bad += [f"edge {e['id']}: unknown node {e[k]}" for k in ("from", "to") if e[k] not in nodes]
    for t in scene["tracks"]:
        if not SLUG.match(str(t.get("id", ""))):
            bad.append(f"lesson id {t.get('id')!r} must be lower-case letters, digits and hyphens")
        if not t.get("steps"):
            bad.append(f"{t.get('id')}: no steps")
            continue
        metric_ids = {m["id"] for m in t.get("metrics", [])}
        for g in t.get("learn", []):
            if not 1 <= g.get("step", 1) <= len(t["steps"]):
                bad.append(f"{t['id']}: learn item points at step {g.get('step')}")
        for i, s in enumerate(t["steps"], 1):
            at = f"{t['id']} step {i}"
            bad += [f"{at}: missing {k}" for k in ("short", "title", "body") if not s.get(k)]
            focus = nodes if s.get("focus", "all") == "all" else set(s["focus"])
            bad += [f"{at}: focus names unknown node {n}" for n in sorted(focus - nodes)]
            for name in ("tags", "relabel"):
                for n in sorted(s.get(name, {})):
                    if n not in focus:
                        bad.append(f"{at}: {name} on {n}, which is not in focus")
            for n, tag in s.get("tags", {}).items():
                if tag.get("tone") not in TONES - {"terracotta"}:
                    bad.append(f"{at}: tag on {n} has tone {tag.get('tone')!r}")
            for hop in s.get("hops", []):
                edge = edges.get(hop.get("e"))
                if edge is None:
                    bad.append(f"{at}: unknown edge {hop.get('e')}")
                elif not {edge["from"], edge["to"]} <= focus:
                    bad.append(f"{at}: hop {hop['e']} leaves the focus")
                if hop.get("kind", "req") not in KINDS:
                    bad.append(f"{at}: hop kind {hop.get('kind')!r}")
            bad += [f"{at}: metric {m} is not declared by the lesson" for m in sorted(set(s.get("metrics", {})) - metric_ids)]
            bad += [f"{at}: change op {c.get('op')!r}" for c in s.get("changes", []) if c.get("op") not in OPS]
            if s.get("idea") and s["idea"].get("kind") not in NOTES:
                bad.append(f"{at}: idea kind {s['idea'].get('kind')!r}")
            if s.get("phase") and s["phase"] not in PHASES:
                bad.append(f"{at}: phase {s['phase']!r} is not one of {', '.join(sorted(PHASES))}")
            if not s.get("sources"):
                bad.append(f"{at}: no source")
            for src in s.get("sources", []):
                bad += [f"{at}: source missing {k}" for k in ("repo", "path", "anchor") if not src.get(k)]
    return bad


def load_course(folder: Path) -> dict[str, Any]:
    course = json.loads((folder / "course.json").read_text(encoding="utf-8"))
    bad: list[str] = []
    if course.get("schema") != COURSE_SCHEMA:
        bad.append(f"course.json: schema must be {COURSE_SCHEMA}")
    bad += [f"course.json: missing {k}" for k in ("id", "title", "intro", "home_repo", "chapters", "about") if not course.get(k)]
    if bad:
        raise CourseError("\n".join(bad))
    if not SLUG.match(course["id"]):
        bad.append("course.json: id must be lower-case letters, digits and hyphens")
    seen: set[str] = set()
    for chapter in course["chapters"]:
        if chapter.get("tone", "terracotta") not in TONES:
            bad.append(f"chapter {chapter.get('title')!r}: tone {chapter.get('tone')!r}")
        scene_path = (folder / chapter["scene"]).resolve()
        if not scene_path.is_relative_to(folder.resolve()):
            raise CourseError(f"scene {chapter['scene']} is outside the course folder")
        scene = json.loads(scene_path.read_text(encoding="utf-8"))
        bad += [f"{chapter['scene']}: {e}" for e in check_scene(scene)]
        for t in scene.get("tracks", []):
            if t.get("id") in seen:
                bad.append(f"lesson id {t['id']} is used twice")
            seen.add(t.get("id"))
        chapter["scene"] = scene
    if bad:
        raise CourseError("\n".join(bad))
    return course


def git(repo: Path, *args: str) -> str:
    done = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, encoding="utf-8", check=False)
    if done.returncode:
        raise CourseError(f"git {' '.join(args)} failed in {repo}: {done.stderr.strip()[:300]}")
    return done.stdout


def parse_repos(values: list[str]) -> dict[str, tuple[Path, str]]:
    repos: dict[str, tuple[Path, str]] = {}
    for value in values:
        name, _, rest = value.partition("=")
        path, _, rev = rest.rpartition("@") if "@" in rest else (rest, "", "HEAD")
        if not name or not path:
            raise CourseError(f"--repo {value!r} must be NAME=PATH or NAME=PATH@REV")
        repos[name] = (Path(path), git(Path(path), "rev-parse", "--verify", rev + "^{commit}").strip())
    return repos


def resolve_sources(course: dict[str, Any], repos: dict[str, tuple[Path, str]]) -> int:
    """Turn every anchor into a line number, or say which ones are gone."""
    cache: dict[tuple[str, str], list[str]] = {}
    count, bad = 0, []
    for chapter in course["chapters"]:
        for t in chapter["scene"]["tracks"]:
            for i, s in enumerate(t["steps"], 1):
                for src in s["sources"]:
                    if src["repo"] not in repos:
                        bad.append(f"{t['id']} step {i}: no --repo given for {src['repo']}")
                        continue
                    path, rev = repos[src["repo"]]
                    key = (src["repo"], src["path"])
                    if key not in cache:
                        try:
                            cache[key] = git(path, "show", f"{rev}:{src['path']}").splitlines()
                        except CourseError:
                            cache[key] = []
                            bad.append(f"{t['id']} step {i}: {src['repo']} has no file {src['path']}")
                    line = next((n for n, text in enumerate(cache[key], 1) if src["anchor"] in text), None)
                    if line is None and cache[key]:
                        bad.append(f"{t['id']} step {i}: anchor not found in {src['path']}: {src['anchor']}")
                    src["line"] = line
                    count += 1
    if bad:
        raise CourseError("\n".join(bad))
    return count


def paragraphs(value: Any) -> list[str]:
    return value if isinstance(value, list) else [value]


def fallback(course: dict[str, Any]) -> str:
    """Plain text of every lesson, for readers without JavaScript."""
    out = [f"<h1>{html.escape(course['title'])}</h1>"]
    for chapter in course["chapters"]:
        for t in chapter["scene"]["tracks"]:
            out.append(f"<h2>{html.escape(t['label'])}</h2><ol>")
            out += [f"<li><strong>{html.escape(s['title'])}</strong> {html.escape(' '.join(paragraphs(s['body'])))}</li>" for s in t["steps"]]
            out.append("</ol>")
    return "".join(out)


def about(course: dict[str, Any], repos: dict[str, tuple[Path, str]], cited: int) -> str:
    rows = [f"<p>{html.escape(p)}</p>" for p in paragraphs(course["about"])]
    checked = ", ".join(f"{name} {rev[:9]}" for name, (_, rev) in repos.items())
    rows.append(f"<p>When this page was built, all {cited} code references pointed at a real line in {html.escape(checked)}.</p>")
    return "".join(rows)


def render(course: dict[str, Any], repos: dict[str, tuple[Path, str]], cited: int) -> str:
    data = {k: course[k] for k in ("id", "title", "home_repo", "chapters")}
    data["kinds"] = course.get("kinds", {})
    values = {
        "TITLE": html.escape(course["title"], quote=True), "INTRO": html.escape(course["intro"], quote=True), "ID": course["id"],
        "CSS": (ASSETS / "page.css").read_text(encoding="utf-8"), "ENGINE": (ASSETS / "engine.js").read_text(encoding="utf-8"),
        "PAGE": (ASSETS / "page.js").read_text(encoding="utf-8"), "ABOUT": about(course, repos, cited), "FALLBACK": fallback(course),
        # "<" never appears raw, so text in a scene cannot close the script element.
        "DATA": json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c"),
    }
    page = (ASSETS / "page.html").read_text(encoding="utf-8")
    # One pass, so text inside a value is never treated as a placeholder.
    return re.sub(r"\{\{([A-Z]+)\}\}", lambda m: values[m.group(1)], page)


def build(folder: Path, repo_args: list[str], out: Path) -> dict[str, Any]:
    course = load_course(folder)
    repos = parse_repos(repo_args)
    cited = resolve_sources(course, repos)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(course, repos, cited), encoding="utf-8", newline="\n")
    tracks = [t for c in course["chapters"] for t in c["scene"]["tracks"]]
    return {"out": str(out), "lessons": len(tracks), "steps": sum(len(t["steps"]) for t in tracks), "citations": cited,
            "revs": {name: rev for name, (_, rev) in repos.items()}}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("course", type=Path, help="folder that holds course.json")
    ap.add_argument("--repo", action="append", default=[], metavar="NAME=PATH[@REV]")
    ap.add_argument("--out", type=Path, default=None, help="default: COURSE_DIR/index.html")
    args = ap.parse_args(argv)
    try:
        print(json.dumps(build(args.course, args.repo, args.out or args.course / "index.html")))
    except (CourseError, OSError, json.JSONDecodeError) as exc:
        print(f"NOT BUILT\n{exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
