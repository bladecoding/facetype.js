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
            var font = opentype.parse(event.target.result);
            var result = convert(font);
            exportString(result, font.names.fontFamily.en + "_" + font.names.fontSubfamily.en + ".json");
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

    var glyphs = Array(font.glyphs.length).fill(0).map((e,i) => font.glyphs.get(i));
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
                result.glyphs[String.fromCharCode(unicode)] = token;
            }
        });
    });
    var firstOr = (arr,  def) => arr.length == 1 ? arr[0] : def;
    result.gpos = (font.tables.gpos && font.tables.gpos.lookups) ? firstOr(font.tables.gpos.lookups.filter(e => e.lookupType == 2)) : undefined;
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

    return JSON.stringify(result);
};

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