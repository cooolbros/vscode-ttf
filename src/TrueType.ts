// By Steve Hanov
// steve.hanov@gmail.com
// Released to the public domain on April 18, 2020


//import { log } from "./log"

// Usage: 
/*
declare let arrayBuffer:ArrayBuffer;
let font  = new TrueTypeFont(arrayBuffer);
// Draw 15 pixel high "hello world" at x, y on canvas context ctx
font.drawText(ctx, "hello world", x, y, 15);
*/

// This is a stand-in for my own logging framework. Replace with yours.
let log = {
    create(prefix: string) {
        return (...args:any[]) => {
            console.log(...args);
        }
    }
};

function assert(condition: boolean, message = "Assertion failed.") {
    if (!condition) {
        throw new Error(message);
    }
}

class BinaryReader {
    private pos = 0;
    getUint8: () => number;
    readonly length: number;

    constructor(dataIn: string | ArrayBuffer) {
        if (typeof dataIn === "string") {
            this.length = dataIn.length;
            this.getUint8 = () => {
                assert(this.pos < dataIn.length);
                return dataIn.charCodeAt(this.pos++) & 0xff;
            };
        } else {
            let data = new Uint8Array(dataIn);
            this.length = data.length;
            this.getUint8 = () => {
                assert(this.pos < data.length);
                return data[this.pos++];
            }
        }
    }

    log = log.create("BinaryReader");

    seek(pos: number) {
        assert(pos >= 0 && pos <= this.length);
        var oldPos = this.pos;
        this.pos = pos;
        return oldPos;
    }

    tell() {
        return this.pos;
    }

    getUint16() {
        return ((this.getUint8() << 8) | this.getUint8()) >>> 0;
    }

    getUint32() {
        return this.getInt32() >>> 0;
    }

    getInt16() {
        var result = this.getUint16();
        if (result & 0x8000) {
            result -= (1 << 16);
        }
        return result;
    }

    getInt32() {
        return ((this.getUint8() << 24) |
            (this.getUint8() << 16) |
            (this.getUint8() << 8) |
            (this.getUint8()));
    }

    getFword() {
        return this.getInt16();
    }

    getUFword() {
        return this.getUint16();
    }

    get2Dot14() {
        return this.getInt16() / (1 << 14);
    }

    getFixed() {
        return this.getInt32() / (1 << 16);
    }

    getString(length: number) {
        var result = "";
        for (var i = 0; i < length; i++) {
            result += String.fromCharCode(this.getUint8());
        }
        return result;
    }

    getUnicodeString(length: number) {
        var result = "";
        for (var i = 0; i < length; i += 2) {
            result += String.fromCharCode(this.getUint16());
        }
        return result;
    }

    getDate() {
        var macTime = this.getUint32() * 0x100000000 + this.getUint32();
        var utcTime = macTime * 1000 + Date.UTC(1904, 1, 1);
        return new Date(utcTime);
    }
}

interface CMap {
    readonly format: number;
    map(charCode: number): number;
}

/**
    Cmap format 0 is just a direct mapping from one byte to the glyph index.
*/
class TrueTypeCmap0 implements CMap {
    format = 0;
    array: number[] = [];

    constructor(file: BinaryReader, length: number) {
        for (var i = 0; i < 256; i++) {
            var glyphIndex = file.getUint8();
            this.log("   Glyph[%s] = %s", i, glyphIndex);
            this.array.push(glyphIndex);
        }
    }

    log = log.create("CMAP0");

    map(charCode: number) {
        if (charCode >= 0 && charCode <= 255) {
            //this.log("charCode %s maps to %s", charCode, this.array[charCode]);
            return this.array[charCode];
        }
        return 0;
    }
}

interface Segment {
    idRangeOffset: number;
    startCode: number;
    endCode: number;
    idDelta: number;
}

/**
    Cmap format 4 is a list of segments which can possibly include gaps
*/
class TrueTypeCmap4 implements CMap {
    format = 4;
    cache: { [key: number]: number } = {};
    segments: Segment[];

    constructor(private file: BinaryReader, length: number) {
        var i, segments: Segment[] = [];

        // 2x segcount
        var segCount = file.getUint16() / 2;

        // 2 * (2**floor(log2(segCount)))
        var searchRange = file.getUint16();
        // log2(searchRange)
        var entrySelector = file.getUint16();
        // (2*segCount) - searchRange
        var rangeShift = file.getUint16();
        // Ending character code for each segment, last is 0xffff
        for (i = 0; i < segCount; i++) {
            segments.push({
                idRangeOffset: 0,
                startCode: 0,
                endCode: file.getUint16(),
                idDelta: 0
            });
        }

        // reservePAd
        file.getUint16();

        // starting character code for each segment
        for (i = 0; i < segCount; i++) {
            segments[i].startCode = file.getUint16();
        }

        // Delta for all character codes in segment
        for (i = 0; i < segCount; i++) {
            segments[i].idDelta = file.getUint16();
        }

        // offset in bytes to glyph indexArray, or 0
        for (i = 0; i < segCount; i++) {
            var ro = file.getUint16();
            if (ro) {
                segments[i].idRangeOffset = file.tell() - 2 + ro;
            } else {
                segments[i].idRangeOffset = 0;
            }
        }

        /*
        for(i = 0; i < segCount; i++) {
            var seg = segments[i];
            this.log("segment[%s] = %s %s %s %s", i,
                seg.startCode, seg.endCode, seg.idDelta, seg.idRangeOffset);
        }
        */


        this.segments = segments;
    }

    log = log.create("CMAP4");

    map(charCode: number) {
        if (!(charCode in this.cache)) {
            for (var j = 0; j < this.segments.length; j++) {
                var segment = this.segments[j];
                if (segment.startCode <= charCode && segment.endCode >=
                    charCode) {
                    var index, glyphIndexAddress;
                    if (segment.idRangeOffset) {
                        glyphIndexAddress = segment.idRangeOffset + 2 *
                            (charCode - segment.startCode);
                        this.file.seek(glyphIndexAddress);
                        index = this.file.getUint16();
                    } else {
                        index = (segment.idDelta + charCode) & 0xffff;
                    }

                    this.log("Charcode %s is between %s and %s; maps to %s (%s) roffset=%s",
                        charCode, segment.startCode, segment.endCode,
                        glyphIndexAddress, index, segment.idRangeOffset);

                    this.cache[charCode] = index;
                    break;
                }
            }

            if (j === this.segments.length) {
                this.cache[charCode] = 0;
            }
        }

        return this.cache[charCode];
    }
};

class Kern0Table {
    swap: boolean;
    offset: number;
    nPairs: number;
    map: { [key: number]: number } = {};
    oldIndex = -1;

    constructor(
        private file: BinaryReader,
        vertical: boolean,
        cross: boolean) {
        this.swap = vertical && !cross || !vertical && cross;
        this.file = file;
        this.offset = file.tell();
        this.nPairs = file.getUint16();
        file.getUint16(); // searchRange
        file.getUint16(); // entrySelector
        file.getUint16(); // rangeShift

        for (var i = 0; i < this.nPairs; i++) {
            var left = file.getUint16();
            var right = file.getUint16();
            var value = file.getFword();
            this.map[(left << 16) | right] = value;
            //this.log("Kern %s/%s->%s", left, right, value);
        }
        this.reset();
    }


    log = log.create("KERN0");

    reset() {
        this.oldIndex = -1;
    }

    get(glyphIndex: number) {
        var x = 0;
        if (this.oldIndex >= 0) {
            var ch = (this.oldIndex << 16) | glyphIndex;
            if (ch in this.map) {
                x = this.map[ch];
            }
            //this.log("Lookup kern pair %s/%s -> %s (%s)",
            //    this.oldIndex, glyphIndex, x, ch);
        }
        this.oldIndex = glyphIndex;
        if (this.swap) {
            return {
                x: 0,
                y: x
            };
        } else {
            return {
                x: x,
                y: 0
            };
        }
    }
};

interface Table {
    checksum: number;
    offset: number;
    length: number;
}

interface Point {
    x: number;
    y: number;
    onCurve: boolean;
}

class GylphComponent {
    points: Point[] = [];
}

interface Glyph {
    contourEnds: number[];
    numberOfContours: number;
    points: Point[];
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

export class TrueTypeFont {
    private file: BinaryReader;
    private cmaps: CMap[] = [];
    private kern: Kern0Table[] = [];
    private tables: { [key: string]: Table };
    private length: number;
    private scalarType = 0;
    private searchRange = 0;
    private entrySelector = 0;
    private rangeShift = 0;
    private version = 0;
    private fontRevision = 0;
    private checksumAdjustment = 0;
    private magicNumber = 0;
    private flags = 0;
    private unitsPerEm = 0;
    private created = new Date();
    private modified = new Date();
    private xMin = 0;
    private yMin = 0;
    private xMax = 0;
    private yMax = 0;
    private macStyle = 0;
    private lowestRecPPEM = 0;
    private fontDirectionHint = 0;
    private indexToLocFormat = 0;
    private glyphDataFormat = 0;
    public fullName = "";
    public fontFamily = "";
    private fontSubFamily = "";
    public postscriptName = "";
    public ascent = 0;
    public descent = 0;
    public lineGap = 0;
    public advanceWidthMax = 0;
    public minLeftSideBearing = 0;
    public minRightSideBearing = 0;
    public xMaxExtent = 0;
    public caretSlopeRise = 0;
    public caretSlopeRun = 0;
    public caretOffset = 0;
    public metricDataFormat = 0;
    public numOfLongHorMetrics = 0;

    constructor(data: ArrayBuffer | string) {
        this.file = new BinaryReader(data);
        this.tables = this.readOffsetTables(this.file);
        this.readHeadTable(this.file);
        this.readNameTable(this.file);
        this.readCmapTable(this.file);
        this.readHheaTable(this.file);
        this.readKernTable(this.file);
        this.length = this.glyphCount();
    }

    log = log.create("TrueType");

    readOffsetTables(file: BinaryReader) {

        /**
            Mandatory tables:
                - cmap
                - glyf
                - head
                - hhead
                - hmtx
                - loca
                - maxp
                - name
                - post
        */
        var tables: { [key: string]: Table } = {};
        this.scalarType = file.getUint32();
        var numTables = file.getUint16();
        this.searchRange = file.getUint16();
        this.entrySelector = file.getUint16();
        this.rangeShift = file.getUint16();

        for (var i = 0; i < numTables; i++) {
            var tag = file.getString(4);
            tables[tag] = {
                checksum: file.getUint32(),
                offset: file.getUint32(),
                length: file.getUint32()
            };

            if (tag !== 'head') {
                this.log("Table %s has checksum 0x%s", tag,
                    tables[tag].checksum.toString(16));
                //assert(this.calculateTableChecksum(file, tables[tag].offset,
                //            tables[tag].length) === tables[tag].checksum);
            }
        }

        return tables;
    }

    calculateTableChecksum(file: BinaryReader, offset: number,
        length: number) {
        var old = file.seek(offset);
        var sum = 0;
        var nlongs = ((length + 3) / 4) >>> 0;
        this.log("nlongs=%s length=%s", nlongs, length);
        while (nlongs--) {
            sum = (sum + file.getUint32()) >>> 0;
        }

        file.seek(old);
        this.log("Checksum calculated is 0x%s", sum.toString(16));
        return sum;
    }

    readHeadTable(file: BinaryReader) {
        assert("head" in this.tables);
        file.seek(this.tables["head"].offset);

        this.version = file.getFixed();
        this.fontRevision = file.getFixed();
        this.checksumAdjustment = file.getUint32();
        this.magicNumber = file.getUint32();
        assert(this.magicNumber === 0x5f0f3cf5);
        this.flags = file.getUint16();
        this.unitsPerEm = file.getUint16();
        this.created = file.getDate();
        this.modified = file.getDate();
        this.xMin = file.getFword();
        this.yMin = file.getFword();
        this.xMax = file.getFword();
        this.yMax = file.getFword();
        this.macStyle = file.getUint16();
        this.lowestRecPPEM = file.getUint16();
        this.fontDirectionHint = file.getInt16();
        this.indexToLocFormat = file.getInt16();
        this.glyphDataFormat = file.getInt16();
    }

    readCmapTable(file: BinaryReader) {
        assert("cmap" in this.tables);
        var tableOffset = this.tables["cmap"].offset;
        file.seek(tableOffset);
        var version = file.getUint16(); // must be 0
        var numberSubtables = file.getUint16();

        // tables must be sorted by platform id and then platform specific
        // encoding.
        for (var i = 0; i < numberSubtables; i++) {
            // platforms are: 
            // 0 - Unicode -- use specific id 6 for full coverage. 0/4 common.
            // 1 - MAcintosh (Discouraged)
            // 2 - reserved
            // 3 - Microsoft
            var platformID = file.getUint16();
            var platformSpecificID = file.getUint16();
            var offset = file.getUint32();
            this.log("CMap platformid=%s specificid=%s offset=%s", platformID,
                platformSpecificID, offset);
            if (platformID === 3 && (platformSpecificID <= 1)) {
                this.readCmap(file, tableOffset + offset);
            }
        }

        // use format 0 table preferably.
        //this.cmaps.sort(function(a, b) {
        //    return a.format - b.format;
        //});
    }

    readCmap(file: BinaryReader, offset: number) {
        var oldPos = file.seek(offset);
        var format = file.getUint16();
        var length = file.getUint16();
        var language = file.getUint16();
        var cmap;

        this.log("    Cmap format %s length %s", format, length);
        if (format === 0) {
            cmap = new TrueTypeCmap0(file, length);
        } else if (format === 4) {
            cmap = new TrueTypeCmap4(file, length);
        }

        if (cmap) {
            this.cmaps.push(cmap);
        }

        file.seek(oldPos);
    }

    readKernTable(file: BinaryReader) {
        if (!("kern" in this.tables)) {
            return;
        }
        var tableOffset = this.tables["kern"].offset;
        file.seek(tableOffset);
        var version = file.getUint16(); // version 0
        var nTables = file.getUint16();

        this.log("Kern Table version: %s", version);
        this.log("Kern nTables: %s", nTables);
        for (var i = 0; i < nTables; i++) {
            version = file.getUint16(); // subtable version
            var length = file.getUint16();
            var coverage = file.getUint16();
            var format = coverage >> 8;
            var cross = coverage & 4;
            var vertical = (coverage & 0x1) === 0;
            this.log("Kerning subtable version %s format %s length %s coverage: %s",
                version, format, length, coverage);
            var kern = null;
            if (format === 0) {
                kern = new Kern0Table(file, vertical, cross != 0);
            } else {
                this.log("Unknown format -- skip");
                file.seek(file.tell() + length);
            }
            if (kern) {
                this.kern.push(kern);
            }
        }
    }

    readNameTable(file: BinaryReader) {
        assert("name" in this.tables);
        var tableOffset = this.tables["name"].offset;
        file.seek(tableOffset);
        var format = file.getUint16(); // must be 0
        var count = file.getUint16();
        var stringOffset = file.getUint16();
        for (var i = 0; i < count; i++) {
            var platformID = file.getUint16();
            var platformSpecificID = file.getUint16();
            var languageID = file.getUint16();
            var nameID = file.getUint16();
            var length = file.getUint16();
            var offset = file.getUint16();
            var old = file.seek(tableOffset + stringOffset + offset);
            var name;
            if (platformID === 0 || platformID === 3) {
                name = file.getUnicodeString(length);
            } else {
                name = file.getString(length);
            }
            this.log("Name %s/%s id %s language %s: %s",
                platformID, platformSpecificID, nameID, languageID, name);
            file.seek(old);

            switch (nameID) {
                case 1:
                    this.fontFamily = name;
                    break;
                case 2:
                    this.fontSubFamily = name;
                    break;
                case 4:
                    this.fullName = name;
                    break;
                case 6:
                    this.postscriptName = name;
                    break;
            }
        }
    }

    readHheaTable(file: BinaryReader) {
        assert("hhea" in this.tables);
        var tableOffset = this.tables["hhea"].offset;
        file.seek(tableOffset);
        var version = file.getFixed(); // 0x00010000
        this.ascent = file.getFword();
        this.descent = file.getFword();
        this.lineGap = file.getFword();
        this.advanceWidthMax = file.getUFword();
        this.minLeftSideBearing = file.getFword();
        this.minRightSideBearing = file.getFword();
        this.xMaxExtent = file.getFword();
        this.caretSlopeRise = file.getInt16();
        this.caretSlopeRun = file.getInt16();
        this.caretOffset = file.getFword();
        file.getInt16(); // reserved
        file.getInt16(); // reserved
        file.getInt16(); // reserved
        file.getInt16(); // reserved
        this.metricDataFormat = file.getInt16();
        this.numOfLongHorMetrics = file.getUint16();
    }

    getHorizontalMetrics(glyphIndex: number) {
        assert("hmtx" in this.tables);
        var file = this.file;
        var old = file.seek(this.tables["hmtx"].offset + 4);
        var offset = this.tables["hmtx"].offset;
        let advanceWidth, leftSideBearing;
        if (glyphIndex < this.numOfLongHorMetrics) {
            offset += glyphIndex * 4;
            old = this.file.seek(offset);
            advanceWidth = file.getUint16();
            leftSideBearing = file.getInt16();
        } else {
            // read the last entry of the hMetrics array
            old = file.seek(offset + (this.numOfLongHorMetrics - 1) * 4);
            advanceWidth = file.getUint16();
            file.seek(offset + this.numOfLongHorMetrics * 4 +
                2 * (glyphIndex - this.numOfLongHorMetrics));
            leftSideBearing = file.getFword();
        }

        this.file.seek(old);
        return {
            advanceWidth: advanceWidth,
            leftSideBearing: leftSideBearing
        };
    }

    glyphCount() {
        assert("maxp" in this.tables);
        var old = this.file.seek(this.tables["maxp"].offset + 4);
        var count = this.file.getUint16();
        this.file.seek(old);
        return count;
    }

    getGlyphOffset(index: number) {
        assert("loca" in this.tables);
        var table = this.tables["loca"];
        var file = this.file;
        var offset, old, next;

        if (this.indexToLocFormat === 1) {
            old = file.seek(table.offset + index * 4);
            offset = file.getUint32();
            next = file.getUint32();
        } else {
            old = file.seek(table.offset + index * 2);
            offset = file.getUint16() * 2;
            next = file.getUint16() * 2;
        }

        file.seek(old);
        if (offset === next) {
            // indicates glyph has no outline( eg space)
            return 0;
        }

        //this.log("Offset for glyph index %s is %s", index, offset);

        return offset + this.tables["glyf"].offset;
    }

    readGlyph(index: number): Glyph | null {
        var offset = this.getGlyphOffset(index);
        var file = this.file;

        if (offset === 0 ||
            offset >= this.tables["glyf"].offset + this.tables["glyf"].length) {
            return null;
        }

        assert(offset >= this.tables["glyf"].offset);
        assert(offset < this.tables["glyf"].offset + this.tables["glyf"].length);

        file.seek(offset);

        var glyph = {
            contourEnds: [],
            numberOfContours: file.getInt16(),
            points: [],
            xMin: file.getFword(),
            yMin: file.getFword(),
            xMax: file.getFword(),
            yMax: file.getFword()
        };

        assert(glyph.numberOfContours >= -1);

        if (glyph.numberOfContours === -1) {
            this.readCompoundGlyph(file, glyph);
        } else {
            this.readSimpleGlyph(file, glyph);
        }

        return glyph;
    }

    readSimpleGlyph(file: BinaryReader, glyph: Glyph) {

        var ON_CURVE = 1,
            X_IS_BYTE = 2,
            Y_IS_BYTE = 4,
            REPEAT = 8,
            X_DELTA = 16,
            Y_DELTA = 32;

        glyph.contourEnds = [];
        var points: Point[] = glyph.points = [];

        for (var i = 0; i < glyph.numberOfContours; i++) {
            glyph.contourEnds.push(file.getUint16());
        }

        // skip over intructions
        file.seek(file.getUint16() + file.tell());

        if (glyph.numberOfContours === 0) {
            return;
        }

        var numPoints = Math.max.apply(null, glyph.contourEnds) + 1;

        var flags: number[] = [];

        for (i = 0; i < numPoints; i++) {
            var flag = file.getUint8();
            flags.push(flag);
            points.push({
                x: 0,
                y: 0,
                onCurve: (flag & ON_CURVE) > 0
            });

            if (flag & REPEAT) {
                var repeatCount = file.getUint8();
                assert(repeatCount > 0);
                i += repeatCount;
                while (repeatCount--) {
                    flags.push(flag);
                    points.push({
                        x: 0,
                        y: 0,
                        onCurve: (flag & ON_CURVE) > 0
                    });
                }
            }
        }

        function readCoords(name: "x" | "y", byteFlag: number,
            deltaFlag: number, min: number, max: number) {
            var value = 0;

            for (var i = 0; i < numPoints; i++) {
                var flag = flags[i];
                if (flag & byteFlag) {
                    if (flag & deltaFlag) {
                        value += file.getUint8();
                    } else {
                        value -= file.getUint8();
                    }
                } else if (~flag & deltaFlag) {
                    value += file.getInt16();
                } else {
                    // value is unchanged.
                }

                points[i][name] = value;
            }
        }

        readCoords("x", X_IS_BYTE, X_DELTA, glyph.xMin, glyph.xMax);
        readCoords("y", Y_IS_BYTE, Y_DELTA, glyph.yMin, glyph.yMax);
    }

    readCompoundGlyph(file: BinaryReader, glyph: Glyph) {
        var ARG_1_AND_2_ARE_WORDS = 1,
            ARGS_ARE_XY_VALUES = 2,
            ROUND_XY_TO_GRID = 4,
            WE_HAVE_A_SCALE = 8,
            // RESERVED              = 16
            MORE_COMPONENTS = 32,
            WE_HAVE_AN_X_AND_Y_SCALE = 64,
            WE_HAVE_A_TWO_BY_TWO = 128,
            WE_HAVE_INSTRUCTIONS = 256,
            USE_MY_METRICS = 512,
            OVERLAP_COMPONENT = 1024;

        var flags = MORE_COMPONENTS;
        var component;
        glyph.contourEnds = [];
        glyph.points = [];
        while (flags & MORE_COMPONENTS) {
            var arg1, arg2;

            flags = file.getUint16();
            component = {
                glyphIndex: file.getUint16(),
                matrix: {
                    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0
                },

                destPointIndex: 0,
                srcPointIndex: 0
            };

            if (flags & ARG_1_AND_2_ARE_WORDS) {
                arg1 = file.getInt16();
                arg2 = file.getInt16();
            } else {
                arg1 = file.getUint8();
                arg2 = file.getUint8();
            }

            if (flags & ARGS_ARE_XY_VALUES) {
                component.matrix.e = arg1;
                component.matrix.f = arg2;
            } else {
                component.destPointIndex = arg1;
                component.srcPointIndex = arg2;
            }

            if (flags & WE_HAVE_A_SCALE) {
                component.matrix.a = file.get2Dot14();
                component.matrix.d = component.matrix.a;
            } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
                component.matrix.a = file.get2Dot14();
                component.matrix.d = file.get2Dot14();
            } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
                component.matrix.a = file.get2Dot14();
                component.matrix.b = file.get2Dot14();
                component.matrix.c = file.get2Dot14();
                component.matrix.d = file.get2Dot14();
            }

            this.log("Read component glyph index %s", component.glyphIndex);
            this.log("Transform: [%s %s %s %s %s %s]", component.matrix.a, component.matrix.b,
                component.matrix.c, component.matrix.d, component.matrix.e, component.matrix.f);
            var old = file.tell();
            var simpleGlyph = this.readGlyph(component.glyphIndex);
            if (simpleGlyph) {
                var pointOffset = glyph.points.length;
                for (var i = 0; i < simpleGlyph.contourEnds.length; i++) {
                    glyph.contourEnds.push(simpleGlyph.contourEnds[i] +
                        pointOffset);
                }
                for (i = 0; i < simpleGlyph.points.length; i++) {
                    var x = simpleGlyph.points[i].x;
                    var y = simpleGlyph.points[i].y;
                    x = component.matrix.a * x + component.matrix.b * y +
                        component.matrix.e;
                    y = component.matrix.c * x + component.matrix.d * y +
                        component.matrix.f;
                    glyph.points.push({
                        x: x, y: y, onCurve:
                            simpleGlyph.points[i].onCurve
                    });
                }
            }

            file.seek(old);
        }

        glyph.numberOfContours = glyph.contourEnds.length;

        if (flags & WE_HAVE_INSTRUCTIONS) {
            file.seek(file.getUint16() + file.tell());
        }

    }

    drawGlyph(ctx: CanvasRenderingContext2D, index: number, x: number, y: number) {

        var glyph = this.readGlyph(index);
        //this.log("Draw GLyph index %s", index);

        if (glyph === null) {
            return false;
        }

        var s = 0,
            p = 0,
            c = 0,
            contourStart = 0,
            prev;

        for (; p < glyph.points.length; p++) {
            var point = glyph.points[p];
            if (s === 0) {
                ctx.moveTo(point.x + x, point.y + y);
                s = 1;
            } else if (s === 1) {
                if (point.onCurve) {
                    ctx.lineTo(point.x + x, point.y + y);
                } else {
                    s = 2;
                }
            } else {
                prev = glyph.points[p - 1];
                if (point.onCurve) {
                    ctx.quadraticCurveTo(prev.x + x, prev.y + y,
                        point.x + x, point.y + y);
                    s = 1;
                } else {
                    ctx.quadraticCurveTo(prev.x + x, prev.y + y,
                        (prev.x + point.x) / 2 + x,
                        (prev.y + point.y) / 2 + y);
                }
            }

            if (p === glyph.contourEnds[c]) {
                if (s === 2) { // final point was off-curve. connect to start
                    prev = point;
                    point = glyph.points[contourStart];
                    if (point.onCurve) {
                        ctx.quadraticCurveTo(prev.x + x, prev.y + y,
                            point.x + x, point.y + y);
                    } else {
                        ctx.quadraticCurveTo(prev.x + x, prev.y + y,
                            (prev.x + point.x) / 2 + x,
                            (prev.y + point.y) / 2 + y);
                    }
                }
                contourStart = p + 1;
                c += 1;
                s = 0;
            }
        }

        return true;
    }

    transform(ctx: CanvasRenderingContext2D, size: number) {
        ctx.scale(size / this.unitsPerEm, -size / this.unitsPerEm);
    }

    drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
        size: number) {
        ctx.save();
        ctx.translate(x, y);
        this.transform(ctx, size);
        x = 0;
        y = 0;
        this.resetKern();
        for (var i = 0; i < text.length; i++) {
            var index = this.mapCode(text.charCodeAt(i));
            var metrics = this.getHorizontalMetrics(index);
            var kern = this.nextKern(index);
            this.log("Metrics for %s code %s index %s: %s %s kern: %s,%s", text.charAt(i),
                text.charCodeAt(i), index, metrics.advanceWidth, metrics.leftSideBearing,
                kern.x, kern.y);
            this.drawGlyph(ctx, index, x + kern.x,//- metrics.leftSideBearing, 
                y + kern.y);

            x += metrics.advanceWidth;
        }
        ctx.restore();
    }

    drawSingleGlyph(ctx: CanvasRenderingContext2D, glyphIndex: number,
        x: number, y: number, size: number) {
        ctx.save();
        ctx.translate(x, y);
        this.transform(ctx, size);
        this.drawGlyph(ctx, glyphIndex, 0, 0);
        ctx.restore();
    }

    mapCode(charCode: number) {
        var index = 0;
        for (var i = 0; i < this.cmaps.length; i++) {
            var cmap = this.cmaps[i];
            index = cmap.map(charCode);
            if (index) {
                break;
            }
        }
        return index;
    }

    resetKern() {
        for (var i = 0; i < this.kern.length; i++) {
            this.kern[i].reset();
        }
    }

    nextKern(glyphIndex: number) {
        var pt, x = 0, y = 0;
        for (var i = 0; i < this.kern.length; i++) {
            pt = this.kern[i].get(glyphIndex);
            x += pt.x;
            y += pt.y;
        }
        return { x: x, y: y };
    }
}

