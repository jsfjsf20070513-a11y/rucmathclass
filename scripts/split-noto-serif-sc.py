"""重新生成随站发布的 Noto Serif SC 切片。日常开发和构建直接使用仓库里的 WOFF2。

上游字体和版本见 SOURCE。下载该文件后运行以下命令。
python3 -m pip install 'fonttools[woff]==4.62.1'
python3 scripts/split-noto-serif-sc.py /path/to/NotoSerifSC.ttf
"""

import argparse
import hashlib
import subprocess
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from itertools import groupby
from pathlib import Path
from tempfile import TemporaryDirectory

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SOURCE = "https://raw.githubusercontent.com/notofonts/noto-cjk/985fa52c81c1d6692ccdd82bc3656e8fb932fd89/google-fonts/NotoSerifSC%5Bwght%5D.ttf"
SHA256 = "050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src/fonts/noto-serif-sc"


def text_points(path):
    return map(ord, (ROOT / path).read_text(encoding="utf-8"))


def groups(points):
    # 首页会同时排版几张可翻动的书页。把其中用到的汉字和标点放在一片。
    home_data = subprocess.check_output(["node", "--input-type=module", "-e", """
        import { dailyTheoremNotes, paroles } from './src/data/siteContent.js'
        import { resourceCategories } from './src/data/resourceCatalog.js'
        console.log([
          ...dailyTheoremNotes.flatMap(t => [t.title, t.displayExpression]),
          ...paroles.flatMap(p => [p.text, p.note, p.author, p.src]),
          ...resourceCategories.map(c => c.label)
        ].join(''))
    """], cwd=ROOT, text=True)
    home = set(map(ord, home_data))
    for path in ("src/pages/Home.jsx", "src/components/AuthStatus.jsx", "src/components/PageBoundary.jsx"):
        home.update(text_points(path))
    home.update(range(0x3000, 0x3040))
    home.update(range(0xFF01, 0xFF61))
    home.update((0xA0, 0x202F))
    home &= points
    yield "home", sorted(home)

    shelves = set()
    for path in ("src/data/resourceCatalog.js", "src/pages/Resources.jsx", "src/components/DailyMeditation.jsx"):
        shelves.update(text_points(path))
    shelves &= points - home
    yield "shelves", sorted(shelves)

    # 词表和 GB 2312 一级汉字用较小的切片，以减少长回答首次用到新字时的下载量。
    rest = points - home - shelves
    frequency = Counter(text_points("src/data/frenchVocabulary.js"))
    common = {cp for cp in rest if frequency[cp] or is_level_one(cp)}
    for label, chars, size in [
        ("common", sorted(common, key=lambda cp: (-frequency[cp], cp)), 96),
        ("extra", sorted(rest - common), 512),
    ]:
        for start in range(0, len(chars), size):
            yield f"{label}-{start // size + 1:02}", sorted(chars[start:start + size])


def is_level_one(cp):
    encoded = chr(cp).encode("gb2312", errors="ignore")
    return len(encoded) == 2 and 0xB0 <= encoded[0] <= 0xD7


def unicode_range(points):
    ranges = []
    for _, run in groupby(enumerate(points), key=lambda item: item[1] - item[0]):
        values = [value for _, value in run]
        first, last = values[0], values[-1]
        ranges.append(f"U+{first:X}" if first == last else f"U+{first:X}-{last:X}")
    return ",".join(ranges)


def write_slice(job):
    path, directory, name, points = job
    with TTFont(path, recalcTimestamp=False) as font:
        options = subset.Options()
        options.layout_features = ["*"]
        options.name_IDs += [13, 14]
        splitter = subset.Subsetter(options=options)
        selectors = {vs for table in font["cmap"].tables if table.format == 14 for vs in table.uvsDict}
        splitter.populate(unicodes=set(points) | selectors)
        splitter.subset(font)
        if not set(points).issubset(font.getBestCmap()):
            raise ValueError(f"{name} 缺少声明中的字符")
        instantiateVariableFont(font, {"wght": (400, 400, 600)}, inplace=True)
        font.flavor = "woff2"
        font.save(directory / f"noto-serif-sc-{name}.woff2")
    return f"""@font-face {{
  font-family: "Noto Serif SC";
  font-style: normal;
  font-weight: 400 600;
  font-display: swap;
  src: url("./noto-serif-sc-{name}.woff2") format("woff2");
  unicode-range: {unicode_range(points)};
}}"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("font", type=Path)
    font_path = parser.parse_args().font
    if hashlib.sha256(font_path.read_bytes()).hexdigest() != SHA256:
        parser.error(f"字体文件校验失败，请从 {SOURCE} 重新下载")
    with TTFont(font_path) as font:
        parts = list(groups(set(font.getBestCmap())))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=OUTPUT.parent) as temporary:
        stage = Path(temporary)
        jobs = [(font_path, stage, name, points) for name, points in parts]
        with ProcessPoolExecutor(max_workers=4) as pool:
            rules = list(pool.map(write_slice, jobs))
        header = "/* 由 scripts/split-noto-serif-sc.py 从上游完整字体生成。 */"
        (stage / "index.css").write_text(header + "\n" + "\n\n".join(rules) + "\n", encoding="utf-8")
        obsolete = {p.name for p in OUTPUT.glob("noto-serif-sc-*.woff2")}
        for file in stage.glob("*.woff2"):
            file.replace(OUTPUT / file.name)
            obsolete.discard(file.name)
        (stage / "index.css").replace(OUTPUT / "index.css")
        for name in obsolete:
            (OUTPUT / name).unlink()


if __name__ == "__main__":
    main()
