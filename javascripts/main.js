var convertButton = document.getElementById("convert");
var fileInput = document.getElementById("fileInput");
var reverseTypeface = document.getElementById("reverseTypeface");
var restrictCharactersCheck = document.getElementById("restrictCharacters");
var restrictCharacterSetInput = document.getElementById("restrictCharacterSet");

window.onload = function () {
    restrictCharacterSetInput.disabled = !restrictCharactersCheck.checked;
}

convertButton.onclick = function () {

    [].forEach.call(fileInput.files, function (file) {
        var reader = new FileReader();
        reader.addEventListener('load', function (event) {
            let result;

            if (file.type == "font/ttf") {
                var font = opentype.parse(event.target.result);
                result = convert(font);
            } else if (file.type == "image/svg+xml") {
                var decoder = new TextDecoder('utf-8');
                var str = decoder.decode(event.target.result);
                const parser = new DOMParser()
                const obj = parser.parseFromString(str, "image/svg+xml");
                result = convertSvg(obj);

            } else {
                alert("Unsupported file type: " + file.type);
                return;
            }

            exportString(JSON.stringify(result), result.fontFamily + "_" + result.fontSubfamily + ".json");

        }, false);
        reader.readAsArrayBuffer(file);
    });
};

restrictCharactersCheck.onchange = function () {
    restrictCharacterSetInput.disabled = !restrictCharactersCheck.checked;
};

var exportString = function (output, filename) {

    var blob = new Blob([output], { type: 'text/plain' });
    var objectURL = URL.createObjectURL(blob);

    var link = document.createElement('a');
    link.href = objectURL;
    link.download = filename || 'data.json';
    link.target = '_blank';
    //link.click();

    var event = document.createEvent("MouseEvents");
    event.initMouseEvent(
        "click", true, false, window, 0, 0, 0, 0, 0
        , false, false, false, false, 0, null
    );
    link.dispatchEvent(event);

};

var convert = function (font) {

    console.log(font);

    var scale = 1; //(1000 * 100) / ((font.unitsPerEm || 2048) * 72);
    var result = {};
    result.glyphs = {};
    result.charMap = {};
    result.indexMap = {};

    var restriction = {
        range: null,
        set: null
    };

    if (restrictCharactersCheck.checked) {
        var restrictContent = restrictCharacterSetInput.value;
        var rangeSeparator = '-';
        if (restrictContent.indexOf(rangeSeparator) != -1) {
            var rangeParts = restrictContent.split(rangeSeparator);
            if (rangeParts.length === 2 && !isNaN(rangeParts[0]) && !isNaN(rangeParts[1])) {
                restriction.range = [parseInt(rangeParts[0]), parseInt(rangeParts[1])];
            }
        }
        if (restriction.range === null) {
            restriction.set = restrictContent;
        }
    }

    var glyphs = Array(font.glyphs.length).fill(0).map((e, i) => font.glyphs.get(i));
    glyphs.forEach(function (glyph) {
        const unicodes = [];
        if (glyph.unicode !== undefined) {
            unicodes.push(glyph.unicode);
        }
        if (glyph.unicodes.length) {
            glyph.unicodes.forEach(function (unicode) {
                if (unicodes.indexOf(unicode) == -1) {
                    unicodes.push(unicode);
                }
            })
        }

        unicodes.forEach(function (unicode) {
            var glyphCharacter = String.fromCharCode(unicode);
            var needToExport = true;
            if (restriction.range !== null) {
                needToExport = (unicode >= restriction.range[0] && unicode <= restriction.range[1]);
            } else if (restriction.set !== null) {
                needToExport = (restrictCharacterSetInput.value.indexOf(glyphCharacter) != -1);
            }
            if (needToExport) {

                var token = {};
                token.ha = (glyph.advanceWidth * scale);
                token.x_min = (glyph.xMin * scale);
                token.x_max = (glyph.xMax * scale);
                token.y_min = (glyph.yMin * scale);
                token.y_max = (glyph.yMax * scale);
                if (reverseTypeface.checked) {
                    glyph.path.commands = reverseCommands(glyph.path.commands);
                }
                token.objs = glyph.path.commands;
                result.charMap[glyphCharacter] = String(unicode);
                result.indexMap[glyph.index] = String(unicode);
                result.glyphs[unicode] = token;
            }
        });
    });

    // symbol font e.g. wingdings
    // create a mapping for ascii to the symbols
    if (font.tables.os2 && (font.tables.os2.ulCodePageRange1 & 0x80000000)) {
        Object.keys(result.glyphs).forEach((id, glyph) => {
            if (id & 0xF000) {
                var overId = id & 0xff;
                var glyphCharacter = String.fromCharCode(overId);
                if (!result.charMap[glyphCharacter]) {
                    result.charMap[glyphCharacter] = String(id);
                }
            }
        });
    }

    var firstOr = (arr, def) => arr.length == 1 ? arr[0] : def;
    result.gposPair = (font.tables.gpos && font.tables.gpos.lookups) ? firstOr(font.tables.gpos.lookups.filter(e => e.lookupType == 2)) : undefined;
    result.familyName = font.familyName;
    result.ascender = (font.ascender * scale);
    result.descender = (font.descender * scale);
    result.underlinePosition = (font.tables.post.underlinePosition * scale);

    result.underlineThickness = (font.tables.post.underlineThickness * scale);
    result.boundingBox = {
        "yMin": (font.tables.head.yMin * scale),
        "xMin": (font.tables.head.xMin * scale),
        "yMax": (font.tables.head.yMax * scale),
        "xMax": (font.tables.head.xMax * scale)
    };
    result.resolution = 1000;
    result.original_font_information = font.tables.name;
    if (font.names.fontSubfamily.en.toLowerCase().indexOf("bold") > -1) {
        result.cssFontWeight = "bold";
    } else {
        result.cssFontWeight = "normal";
    };

    if (font.names.fontSubfamily.en.toLowerCase().indexOf("italic") > -1) {
        result.cssFontStyle = "italic";
    } else {
        result.cssFontStyle = "normal";
    };

    result.fontFamily = font.names.fontFamily.en;
    result.fontSubfamily = font.names.fontSubfamily.en;

    return result;
};

var xmlToObj = function (xml) {
    var obj = {};
    obj.tag = xml.tagName ?? xml.nodeName;
    obj.attrs = {};
    _.forEach(xml.attributes, (v) => {
        obj.attrs[v.name] = v.value;
    });
    obj.children = [];
    _.forEach(xml.children, (v) => {
        obj.children.push(xmlToObj(v))
    });
    return obj;
};

var pathToObjs = function (glyph, str) {
    let objs = [];
    if (typeof str !== 'string')
        return objs;
    let els = _(str.split(/([mMzZlLqQcC ])/)).filter(v => v != '' && v != ' ');
    let next = () => { let x = els.next(); return !x.done ? x.value : undefined; };
    let nextNum = () => Math.round(Number(next()));
    let cmd;
    let cur = [0, 0];
    while ((cmd = next())) {
        // lower case is relative, upper case is absolute
        // convert commands to absolute
        let offset = cmd == cmd.toUpperCase() ? [0, 0] : cur;
        cmd = cmd.toUpperCase();
        if (cmd == 'M') {
            let x = nextNum() + offset[0];
            let y = nextNum() + offset[1];
            objs.push({ 'type': cmd, 'x': x, 'y': y });
            cur = [x, y];
        } else if (cmd == 'Z') {
            objs.push({ 'type': cmd });
            cur = [0, 0];
        } else if (cmd == 'L') {
            let x = nextNum() + offset[0];
            let y = nextNum() + offset[1];
            objs.push({ 'type': cmd, 'x': x, 'y': y });
            cur = [x, y];
        } else if (cmd == 'Q') {
            let x1 = nextNum() + offset[0];
            let y1 = nextNum() + offset[1];
            let x = nextNum() + offset[0];
            let y = nextNum() + offset[1];
            objs.push({ 'type': cmd, 'x': x, 'y': y, 'x1': x1, 'y1': y1 });
            cur = [x, y];
        } else if (cmd == 'C') {
            let x1 = nextNum() + offset[0];
            let y1 = nextNum() + offset[1];
            let x2 = nextNum() + offset[0];
            let y2 = nextNum() + offset[1];
            let x = nextNum() + offset[0];
            let y = nextNum() + offset[1];
            objs.push({ 'type': cmd, 'x': x, 'y': y, 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2 });
            cur = [x, y];
        } else {
            throw "Invalid cmd '" + cmd + "' for glyph '" + glyph + "'";
        }
    }
    return objs;
}

var convertSvg = function (svgXml) {
    var svg = xmlToObj(svgXml);
    var defs = _.findValueDeep(svg, (v, k, p) => v.tag == 'defs', { childrenPath: 'children' });
    if (!defs)
        throw "SVG doesn't contain fonts";

    var fonts = _.filter(defs.children, v => v.tag == 'font');
    if (fonts.length == 0)
        throw "SVG doesn't contain fonts";
    if (fonts.length > 1)
        alert('SVG contains more than 1 font. Only converting first font');
    let font = fonts[0];

    var fontFace = _.find(font.children, v => v.tag == 'font-face');
    if (!fontFace)
        throw "SVG doesn't contain font-face";

    let result = {};
    result.glyphs = {};
    result.charMap = {};
    result.indexMap = {};

    _(font.children)
        .filter(v => v.tag == 'glyph')
        .forEach((v, i) => {
            let token = {};
            let unicode = v.attrs.unicode.charCodeAt(0);
            let glyphCharacter = v.attrs.unicode[0];

            token.ha = Number(v['horiz-adv-x'] ?? font.attrs['horiz-adv-x']);
            token.objs = pathToObjs(glyphCharacter, v.attrs.d);
            let xs = _.flatMap(token.objs, o => [o.x, o.x1, o.x2]);
            let ys = _.flatMap(token.objs, o => [o.y, o.y1, o.y2]);
            let minX = _.min(xs);
            let minY = _.min(ys);
            let maxX = _.max(xs);
            let maxY = _.max(ys);
            token.x_min = minX;
            token.y_min = minY;
            token.x_max = maxX;
            token.y_max = maxY;
            result.charMap[glyphCharacter] = String(unicode);
            result.indexMap[i] = String(unicode);
            result.glyphs[unicode] = token;
        });

    result.ascender = Number(fontFace.attrs.ascent);
    result.descender = Number(fontFace.attrs.descent);
    result.underlinePosition = fontFace.attrs['underline-position'] ? Number(fontFace.attrs['underline-position']) : undefined;
    result.underlineThickness = fontFace.attrs['underline-thickness'] ? Number(fontFace.attrs['underline-thickness']) : undefined;

    result.boundingBox = {
        "xMin": _.min(_.map(result.glyphs, v => v.x_min)),
        "yMin": _.min(_.map(result.glyphs, v => v.y_min)),
        "xMax": _.max(_.map(result.glyphs, v => v.x_max)),
        "yMax": _.max(_.map(result.glyphs, v => v.y_max)),
    };
    result.resolution = Number(fontFace.attrs['units-per-em']);
    result.fontSubfamily = "normal";
    result.fontFamily = fontFace.attrs['font-family'];

    return result;
}

var reverseCommands = function (commands) {

    var paths = [];
    var path;

    commands.forEach(function (c) {
        if (c.type.toLowerCase() === "m") {
            path = [c];
            paths.push(path);
        } else if (c.type.toLowerCase() !== "z") {
            path.push(c);
        }
    });

    var reversed = [];
    paths.forEach(function (p) {
        var result = { "type": "m", "x": p[p.length - 1].x, "y": p[p.length - 1].y };
        reversed.push(result);

        for (var i = p.length - 1; i > 0; i--) {
            var command = p[i];
            result = { "type": command.type };
            if (command.x2 !== undefined && command.y2 !== undefined) {
                result.x1 = command.x2;
                result.y1 = command.y2;
                result.x2 = command.x1;
                result.y2 = command.y1;
            } else if (command.x1 !== undefined && command.y1 !== undefined) {
                result.x1 = command.x1;
                result.y1 = command.y1;
            }
            result.x = p[i - 1].x;
            result.y = p[i - 1].y;
            reversed.push(result);
        }

    });

    return reversed;

};