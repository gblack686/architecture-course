"""The builder must refuse a course that cannot be drawn or proven."""
from __future__ import annotations

import copy
import importlib.util
import json
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "architecture-course"
EXAMPLE = ROOT / "examples" / "how-it-works"

spec = importlib.util.spec_from_file_location("build_course", SKILL / "scripts" / "build_course.py")
bc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bc)

SCENE = {
    "schema": "gbauto.arch-scene.v1", "id": "demo", "zones": [],
    "nodes": [{"id": "a", "label": "A", "x": 0, "y": 0, "shape": "block", "tone": "blue", "icon": "file"},
              {"id": "b", "label": "B", "x": 4, "y": 0, "shape": "disk", "tone": "green", "icon": "file"}],
    "edges": [{"id": "ab", "from": "a", "to": "b"}],
    "tracks": [{"id": "lesson", "label": "Lesson", "metrics": [{"id": "m", "label": "M"}], "learn": [{"text": "x", "step": 1}],
                "steps": [{"short": "Go", "phase": "Setup", "title": "It goes", "body": "Words", "focus": ["a", "b"], "hops": [{"e": "ab"}],
                           "metrics": {"m": "1"}, "sources": [{"repo": "demo", "path": "code.py", "anchor": "def go("}]}]}],
}
COURSE = {"schema": "gbauto.architecture-course.v1", "id": "demo", "title": "Demo", "intro": "Intro", "home_repo": "demo",
          "about": ["About"], "chapters": [{"title": "One", "tone": "blue", "scene": "scenes/demo.json"}]}


@pytest.fixture
def made(tmp_path):
    """A small git repository and a course that cites it."""
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "code.py").write_text("# top\n\ndef go():\n    pass\n", encoding="utf-8")
    for args in (["init", "-q"], ["add", "."], ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "x"]):
        subprocess.run(["git", "-C", str(repo), *args], check=True)

    def write(scene=SCENE, course=COURSE):
        folder = tmp_path / "course"
        (folder / "scenes").mkdir(parents=True, exist_ok=True)
        (folder / "scenes" / "demo.json").write_text(json.dumps(scene), encoding="utf-8")
        (folder / "course.json").write_text(json.dumps(course), encoding="utf-8")
        return folder

    return repo, write


def test_builds_and_records_the_line(made):
    repo, write = made
    folder = write()
    out = folder / "index.html"
    result = bc.build(folder, [f"demo={repo}"], out)
    page = out.read_text(encoding="utf-8")
    assert result["citations"] == 1 and result["steps"] == 1
    assert '"line":3' in page
    assert not re.search(r"\{\{[A-Z]+\}\}", page)


@pytest.mark.parametrize("change, message", [
    (lambda s: s["tracks"][0]["steps"][0]["hops"].append({"e": "nope"}), "unknown edge nope"),
    (lambda s: s["tracks"][0]["steps"][0].update(focus=["a"]), "leaves the focus"),
    (lambda s: s["tracks"][0]["steps"][0].update(focus=["a", "b", "z"]), "unknown node z"),
    (lambda s: s["tracks"][0]["steps"][0].update(sources=[]), "no source"),
    (lambda s: s["tracks"][0]["steps"][0].update(phase="Maybe"), "phase"),
    (lambda s: s["tracks"][0]["steps"][0].update(metrics={"other": "1"}), "not declared"),
    (lambda s: s["tracks"][0]["steps"][0].update(idea={"kind": "shout", "text": "x"}), "idea kind"),
    (lambda s: s["tracks"][0]["steps"][0].update(changes=[{"op": "poke", "text": "x"}]), "change op"),
    (lambda s: s["tracks"][0]["steps"][0].update(tags={"a": {"t": "x", "tone": "pink"}}), "tone"),
    (lambda s: s["tracks"][0]["learn"].append({"text": "x", "step": 9}), "learn item"),
    (lambda s: s["nodes"][0].update(icon="unicorn"), "icon"),
    (lambda s: s["nodes"].append(dict(s["nodes"][0])), "duplicate id"),
    (lambda s: s["edges"][0].update(to="gone"), "unknown node gone"),
    (lambda s: s["tracks"][0].update(id="Bad Id"), "lesson id"),
])
def test_refuses_a_scene_that_cannot_be_drawn(change, message):
    scene = copy.deepcopy(SCENE)
    change(scene)
    assert any(message in e for e in bc.check_scene(scene)), bc.check_scene(scene)


@pytest.mark.parametrize("source, message", [
    ({"repo": "demo", "path": "code.py", "anchor": "def stop("}, "anchor not found"),
    ({"repo": "demo", "path": "gone.py", "anchor": "x"}, "has no file"),
    ({"repo": "other", "path": "code.py", "anchor": "x"}, "no --repo given"),
])
def test_refuses_a_source_that_is_not_there(made, source, message):
    repo, write = made
    scene = copy.deepcopy(SCENE)
    scene["tracks"][0]["steps"][0]["sources"] = [source]
    folder = write(scene)
    with pytest.raises(bc.CourseError, match=message):
        bc.build(folder, [f"demo={repo}"], folder / "index.html")
    assert not (folder / "index.html").exists()


def test_scene_text_cannot_break_out_of_the_page(made):
    repo, write = made
    scene = copy.deepcopy(SCENE)
    scene["tracks"][0]["steps"][0]["body"] = "</script><script>alert(1)</script> {{CSS}}"
    folder = write(scene, {**COURSE, "title": 'A "quoted" <b>title</b>'})
    bc.build(folder, [f"demo={repo}"], folder / "index.html")
    page = (folder / "index.html").read_text(encoding="utf-8")
    assert "<script>alert(1)" not in page
    assert "<b>title</b>" not in page
    assert "{{CSS}}" in page  # text stays text


def test_scene_must_stay_in_the_course_folder(made, tmp_path):
    _, write = made
    (tmp_path / "outside.json").write_text(json.dumps(SCENE), encoding="utf-8")
    folder = write(SCENE, {**COURSE, "chapters": [{"title": "One", "scene": "../outside.json"}]})
    with pytest.raises(bc.CourseError, match="outside the course folder"):
        bc.load_course(folder)


def test_lesson_ids_are_unique_across_chapters(made):
    _, write = made
    folder = write(SCENE, {**COURSE, "chapters": COURSE["chapters"] * 2})
    with pytest.raises(bc.CourseError, match="used twice"):
        bc.load_course(folder)


def test_shipped_example_is_valid():
    course = bc.load_course(EXAMPLE)
    labels = [t["label"] for c in course["chapters"] for t in c["scene"]["tracks"]]
    assert len(labels) >= 2
    # A step that cites this repository must still find its anchor in the working tree.
    for chapter in course["chapters"]:
        for track in chapter["scene"]["tracks"]:
            for step in track["steps"]:
                for src in step["sources"]:
                    if src["repo"] == "architecture-course":
                        assert src["anchor"] in (ROOT / src["path"]).read_text(encoding="utf-8"), src


def test_every_version_matches():
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    assert f'content="architecture-course {version}"' in (SKILL / "assets" / "page.html").read_text(encoding="utf-8")
    assert f'version: "{version}"' in (SKILL / "SKILL.md").read_text(encoding="utf-8")
    assert f"## {version} " in (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    assert f"--branch v{version} " in (ROOT / "README.md").read_text(encoding="utf-8")
