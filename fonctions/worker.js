/*! Chalet Bellevue — relais site ↔ logiciel (sources : site-relais/). Contient qrcode-generator 1.4.4, (c) 2009 Kazuhiko Arase, licence MIT. */
// qrcode.mjs
var qrcode = function() {
  var qrcode2 = function(typeNumber, errorCorrectionLevel) {
    var PAD0 = 236;
    var PAD1 = 17;
    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];
    var _this = {};
    var makeImpl = function(test, maskPattern) {
      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);
      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);
      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }
      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }
      mapData(_dataCache, maskPattern);
    };
    var setupPositionProbePattern = function(row, col) {
      for (var r = -1; r <= 7; r += 1) {
        if (row + r <= -1 || _moduleCount <= row + r) continue;
        for (var c = -1; c <= 7; c += 1) {
          if (col + c <= -1 || _moduleCount <= col + c) continue;
          if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };
    var getBestMaskPattern = function() {
      var minLostPoint = 0;
      var pattern = 0;
      for (var i = 0; i < 8; i += 1) {
        makeImpl(true, i);
        var lostPoint = QRUtil.getLostPoint(_this);
        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }
      return pattern;
    };
    var setupTimingPattern = function() {
      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = r % 2 == 0;
      }
      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = c % 2 == 0;
      }
    };
    var setupPositionAdjustPattern = function() {
      var pos = QRUtil.getPatternPosition(_typeNumber);
      for (var i = 0; i < pos.length; i += 1) {
        for (var j = 0; j < pos.length; j += 1) {
          var row = pos[i];
          var col = pos[j];
          if (_modules[row][col] != null) {
            continue;
          }
          for (var r = -2; r <= 2; r += 1) {
            for (var c = -2; c <= 2; c += 1) {
              if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };
    var setupTypeNumber = function(test) {
      var bits = QRUtil.getBCHTypeNumber(_typeNumber);
      for (var i = 0; i < 18; i += 1) {
        var mod = !test && (bits >> i & 1) == 1;
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }
      for (var i = 0; i < 18; i += 1) {
        var mod = !test && (bits >> i & 1) == 1;
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };
    var setupTypeInfo = function(test, maskPattern) {
      var data = _errorCorrectionLevel << 3 | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);
      for (var i = 0; i < 15; i += 1) {
        var mod = !test && (bits >> i & 1) == 1;
        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }
      for (var i = 0; i < 15; i += 1) {
        var mod = !test && (bits >> i & 1) == 1;
        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }
      _modules[_moduleCount - 8][8] = !test;
    };
    var mapData = function(data, maskPattern) {
      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);
      for (var col = _moduleCount - 1; col > 0; col -= 2) {
        if (col == 6) col -= 1;
        while (true) {
          for (var c = 0; c < 2; c += 1) {
            if (_modules[row][col - c] == null) {
              var dark = false;
              if (byteIndex < data.length) {
                dark = (data[byteIndex] >>> bitIndex & 1) == 1;
              }
              var mask = maskFunc(row, col - c);
              if (mask) {
                dark = !dark;
              }
              _modules[row][col - c] = dark;
              bitIndex -= 1;
              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };
    var createBytes = function(buffer, rsBlocks) {
      var offset = 0;
      var maxDcCount = 0;
      var maxEcCount = 0;
      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);
      for (var r = 0; r < rsBlocks.length; r += 1) {
        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;
        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
        }
      }
      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }
      var data = new Array(totalCodeCount);
      var index = 0;
      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }
      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }
      return data;
    };
    var createData = function(typeNumber2, errorCorrectionLevel2, dataList) {
      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
      var buffer = qrBitBuffer();
      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
        data.write(buffer);
      }
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }
      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
      }
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }
      while (true) {
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);
        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }
      return createBytes(buffer, rsBlocks);
    };
    _this.addData = function(data, mode) {
      mode = mode || "Byte";
      var newData = null;
      switch (mode) {
        case "Numeric":
          newData = qrNumber(data);
          break;
        case "Alphanumeric":
          newData = qrAlphaNum(data);
          break;
        case "Byte":
          newData = qr8BitByte(data);
          break;
        case "Kanji":
          newData = qrKanji(data);
          break;
        default:
          throw "mode:" + mode;
      }
      _dataList.push(newData);
      _dataCache = null;
    };
    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + "," + col;
      }
      return _modules[row][col];
    };
    _this.getModuleCount = function() {
      return _moduleCount;
    };
    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber2 = 1;
        for (; typeNumber2 < 40; typeNumber2++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
          var buffer = qrBitBuffer();
          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
            data.write(buffer);
          }
          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }
          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }
        _typeNumber = typeNumber2;
      }
      makeImpl(false, getBestMaskPattern());
    };
    _this.createTableTag = function(cellSize, margin) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      var qrHtml = "";
      qrHtml += '<table style="';
      qrHtml += " border-width: 0px; border-style: none;";
      qrHtml += " border-collapse: collapse;";
      qrHtml += " padding: 0px; margin: " + margin + "px;";
      qrHtml += '">';
      qrHtml += "<tbody>";
      for (var r = 0; r < _this.getModuleCount(); r += 1) {
        qrHtml += "<tr>";
        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += " border-width: 0px; border-style: none;";
          qrHtml += " border-collapse: collapse;";
          qrHtml += " padding: 0px; margin: 0px;";
          qrHtml += " width: " + cellSize + "px;";
          qrHtml += " height: " + cellSize + "px;";
          qrHtml += " background-color: ";
          qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
          qrHtml += ";";
          qrHtml += '"/>';
        }
        qrHtml += "</tr>";
      }
      qrHtml += "</tbody>";
      qrHtml += "</table>";
      return qrHtml;
    };
    _this.createSvgTag = function(cellSize, margin, alt, title) {
      var opts = {};
      if (typeof arguments[0] == "object") {
        opts = arguments[0];
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      alt = typeof alt === "string" ? { text: alt } : alt || {};
      alt.text = alt.text || null;
      alt.id = alt.text ? alt.id || "qrcode-description" : null;
      title = typeof title === "string" ? { text: title } : title || {};
      title.text = title.text || null;
      title.id = title.text ? title.id || "qrcode-title" : null;
      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg2 = "", rect;
      rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
      qrSvg2 += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg2 += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
      qrSvg2 += ' viewBox="0 0 ' + size + " " + size + '" ';
      qrSvg2 += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg2 += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
      qrSvg2 += ">";
      qrSvg2 += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
      qrSvg2 += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
      qrSvg2 += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg2 += '<path d="';
      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c)) {
            mc = c * cellSize + margin;
            qrSvg2 += "M" + mc + "," + mr + rect;
          }
        }
      }
      qrSvg2 += '" stroke="transparent" fill="black"/>';
      qrSvg2 += "</svg>";
      return qrSvg2;
    };
    _this.createDataURL = function(cellSize, margin) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;
      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor((x - min) / cellSize);
          var r = Math.floor((y - min) / cellSize);
          return _this.isDark(r, c) ? 0 : 1;
        } else {
          return 1;
        }
      });
    };
    _this.createImgTag = function(cellSize, margin, alt) {
      cellSize = cellSize || 2;
      margin = typeof margin == "undefined" ? cellSize * 4 : margin;
      var size = _this.getModuleCount() * cellSize + margin * 2;
      var img = "";
      img += "<img";
      img += ' src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += ' width="';
      img += size;
      img += '"';
      img += ' height="';
      img += size;
      img += '"';
      if (alt) {
        img += ' alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += "/>";
      return img;
    };
    var escapeXml = function(s) {
      var escaped = "";
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch (c) {
          case "<":
            escaped += "&lt;";
            break;
          case ">":
            escaped += "&gt;";
            break;
          case "&":
            escaped += "&amp;";
            break;
          case '"':
            escaped += "&quot;";
            break;
          default:
            escaped += c;
            break;
        }
      }
      return escaped;
    };
    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = typeof margin == "undefined" ? cellSize * 2 : margin;
      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;
      var y, x, r1, r2, p;
      var blocks = {
        "\u2588\u2588": "\u2588",
        "\u2588 ": "\u2580",
        " \u2588": "\u2584",
        "  ": " "
      };
      var blocksLastLineNoMargin = {
        "\u2588\u2588": "\u2580",
        "\u2588 ": "\u2580",
        " \u2588": " ",
        "  ": " "
      };
      var ascii = "";
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = "\u2588";
          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = " ";
          }
          if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += " ";
          } else {
            p += "\u2588";
          }
          ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
        }
        ascii += "\n";
      }
      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("\u2580");
      }
      return ascii.substring(0, ascii.length - 1);
    };
    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;
      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }
      cellSize -= 1;
      margin = typeof margin == "undefined" ? cellSize * 2 : margin;
      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;
      var y, x, r, p;
      var white = Array(cellSize + 1).join("\u2588\u2588");
      var black = Array(cellSize + 1).join("  ");
      var ascii = "";
      var line = "";
      for (y = 0; y < size; y += 1) {
        r = Math.floor((y - min) / cellSize);
        line = "";
        for (x = 0; x < size; x += 1) {
          p = 1;
          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }
          line += p ? white : black;
        }
        for (r = 0; r < cellSize; r += 1) {
          ascii += line + "\n";
        }
      }
      return ascii.substring(0, ascii.length - 1);
    };
    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? "black" : "white";
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    };
    return _this;
  };
  qrcode2.stringToBytesFuncs = {
    "default": function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 255);
      }
      return bytes;
    }
  };
  qrcode2.stringToBytes = qrcode2.stringToBytesFuncs["default"];
  qrcode2.createStringToBytes = function(unicodeData, numChars) {
    var unicodeMap = function() {
      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw "eof";
        return b;
      };
      var count = 0;
      var unicodeMap2 = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode(b0 << 8 | b1);
        var v = b2 << 8 | b3;
        unicodeMap2[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + " != " + numChars;
      }
      return unicodeMap2;
    }();
    var unknownChar = "?".charCodeAt(0);
    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == "number") {
            if ((b & 255) == b) {
              bytes.push(b);
            } else {
              bytes.push(b >>> 8);
              bytes.push(b & 255);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };
  var QRMode = {
    MODE_NUMBER: 1 << 0,
    MODE_ALPHA_NUM: 1 << 1,
    MODE_8BIT_BYTE: 1 << 2,
    MODE_KANJI: 1 << 3
  };
  var QRErrorCorrectionLevel = {
    L: 1,
    M: 0,
    Q: 3,
    H: 2
  };
  var QRMaskPattern = {
    PATTERN000: 0,
    PATTERN001: 1,
    PATTERN010: 2,
    PATTERN011: 3,
    PATTERN100: 4,
    PATTERN101: 5,
    PATTERN110: 6,
    PATTERN111: 7
  };
  var QRUtil = function() {
    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
    var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
    var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
    var _this = {};
    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };
    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
      }
      return (data << 10 | d) ^ G15_MASK;
    };
    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
      }
      return data << 12 | d;
    };
    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };
    _this.getMaskFunction = function(maskPattern) {
      switch (maskPattern) {
        case QRMaskPattern.PATTERN000:
          return function(i, j) {
            return (i + j) % 2 == 0;
          };
        case QRMaskPattern.PATTERN001:
          return function(i, j) {
            return i % 2 == 0;
          };
        case QRMaskPattern.PATTERN010:
          return function(i, j) {
            return j % 3 == 0;
          };
        case QRMaskPattern.PATTERN011:
          return function(i, j) {
            return (i + j) % 3 == 0;
          };
        case QRMaskPattern.PATTERN100:
          return function(i, j) {
            return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
          };
        case QRMaskPattern.PATTERN101:
          return function(i, j) {
            return i * j % 2 + i * j % 3 == 0;
          };
        case QRMaskPattern.PATTERN110:
          return function(i, j) {
            return (i * j % 2 + i * j % 3) % 2 == 0;
          };
        case QRMaskPattern.PATTERN111:
          return function(i, j) {
            return (i * j % 3 + (i + j) % 2) % 2 == 0;
          };
        default:
          throw "bad maskPattern:" + maskPattern;
      }
    };
    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
      }
      return a;
    };
    _this.getLengthInBits = function(mode, type) {
      if (1 <= type && type < 10) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 10;
          case QRMode.MODE_ALPHA_NUM:
            return 9;
          case QRMode.MODE_8BIT_BYTE:
            return 8;
          case QRMode.MODE_KANJI:
            return 8;
          default:
            throw "mode:" + mode;
        }
      } else if (type < 27) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 12;
          case QRMode.MODE_ALPHA_NUM:
            return 11;
          case QRMode.MODE_8BIT_BYTE:
            return 16;
          case QRMode.MODE_KANJI:
            return 10;
          default:
            throw "mode:" + mode;
        }
      } else if (type < 41) {
        switch (mode) {
          case QRMode.MODE_NUMBER:
            return 14;
          case QRMode.MODE_ALPHA_NUM:
            return 13;
          case QRMode.MODE_8BIT_BYTE:
            return 16;
          case QRMode.MODE_KANJI:
            return 12;
          default:
            throw "mode:" + mode;
        }
      } else {
        throw "type:" + type;
      }
    };
    _this.getLostPoint = function(qrcode3) {
      var moduleCount = qrcode3.getModuleCount();
      var lostPoint = 0;
      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {
          var sameCount = 0;
          var dark = qrcode3.isDark(row, col);
          for (var r = -1; r <= 1; r += 1) {
            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }
            for (var c = -1; c <= 1; c += 1) {
              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }
              if (r == 0 && c == 0) {
                continue;
              }
              if (dark == qrcode3.isDark(row + r, col + c)) {
                sameCount += 1;
              }
            }
          }
          if (sameCount > 5) {
            lostPoint += 3 + sameCount - 5;
          }
        }
      }
      ;
      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode3.isDark(row, col)) count += 1;
          if (qrcode3.isDark(row + 1, col)) count += 1;
          if (qrcode3.isDark(row, col + 1)) count += 1;
          if (qrcode3.isDark(row + 1, col + 1)) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }
      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode3.isDark(row, col) && !qrcode3.isDark(row, col + 1) && qrcode3.isDark(row, col + 2) && qrcode3.isDark(row, col + 3) && qrcode3.isDark(row, col + 4) && !qrcode3.isDark(row, col + 5) && qrcode3.isDark(row, col + 6)) {
            lostPoint += 40;
          }
        }
      }
      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode3.isDark(row, col) && !qrcode3.isDark(row + 1, col) && qrcode3.isDark(row + 2, col) && qrcode3.isDark(row + 3, col) && qrcode3.isDark(row + 4, col) && !qrcode3.isDark(row + 5, col) && qrcode3.isDark(row + 6, col)) {
            lostPoint += 40;
          }
        }
      }
      var darkCount = 0;
      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode3.isDark(row, col)) {
            darkCount += 1;
          }
        }
      }
      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;
      return lostPoint;
    };
    return _this;
  }();
  var QRMath = function() {
    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i]] = i;
    }
    var _this = {};
    _this.glog = function(n) {
      if (n < 1) {
        throw "glog(" + n + ")";
      }
      return LOG_TABLE[n];
    };
    _this.gexp = function(n) {
      while (n < 0) {
        n += 255;
      }
      while (n >= 256) {
        n -= 255;
      }
      return EXP_TABLE[n];
    };
    return _this;
  }();
  function qrPolynomial(num, shift) {
    if (typeof num.length == "undefined") {
      throw num.length + "/" + shift;
    }
    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num2 = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num2[i] = num[i + offset];
      }
      return _num2;
    }();
    var _this = {};
    _this.getAt = function(index) {
      return _num[index];
    };
    _this.getLength = function() {
      return _num.length;
    };
    _this.multiply = function(e) {
      var num2 = new Array(_this.getLength() + e.getLength() - 1);
      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
        }
      }
      return qrPolynomial(num2, 0);
    };
    _this.mod = function(e) {
      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }
      var ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
      var num2 = new Array(_this.getLength());
      for (var i = 0; i < _this.getLength(); i += 1) {
        num2[i] = _this.getAt(i);
      }
      for (var i = 0; i < e.getLength(); i += 1) {
        num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
      }
      return qrPolynomial(num2, 0).mod(e);
    };
    return _this;
  }
  ;
  var QRRSBlock = function() {
    var RS_BLOCK_TABLE = [
      // L
      // M
      // Q
      // H
      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],
      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],
      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],
      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],
      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],
      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],
      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],
      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],
      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],
      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],
      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],
      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],
      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],
      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],
      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],
      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],
      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],
      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],
      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],
      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],
      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],
      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],
      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],
      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],
      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],
      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],
      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],
      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],
      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],
      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],
      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],
      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],
      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],
      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],
      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],
      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],
      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],
      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],
      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],
      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];
    var qrRSBlock = function(totalCount, dataCount) {
      var _this2 = {};
      _this2.totalCount = totalCount;
      _this2.dataCount = dataCount;
      return _this2;
    };
    var _this = {};
    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case QRErrorCorrectionLevel.L:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case QRErrorCorrectionLevel.M:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case QRErrorCorrectionLevel.Q:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case QRErrorCorrectionLevel.H:
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
      if (typeof rsBlock == "undefined") {
        throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
      }
      var length = rsBlock.length / 3;
      var list = [];
      for (var i = 0; i < length; i += 1) {
        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];
        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount));
        }
      }
      return list;
    };
    return _this;
  }();
  var qrBitBuffer = function() {
    var _buffer = [];
    var _length = 0;
    var _this = {};
    _this.getBuffer = function() {
      return _buffer;
    };
    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
    };
    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit((num >>> length - i - 1 & 1) == 1);
      }
    };
    _this.getLengthInBits = function() {
      return _length;
    };
    _this.putBit = function(bit) {
      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }
      if (bit) {
        _buffer[bufIndex] |= 128 >>> _length % 8;
      }
      _length += 1;
    };
    return _this;
  };
  var qrNumber = function(data) {
    var _mode = QRMode.MODE_NUMBER;
    var _data = data;
    var _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _data.length;
    };
    _this.write = function(buffer) {
      var data2 = _data;
      var i = 0;
      while (i + 2 < data2.length) {
        buffer.put(strToNum(data2.substring(i, i + 3)), 10);
        i += 3;
      }
      if (i < data2.length) {
        if (data2.length - i == 1) {
          buffer.put(strToNum(data2.substring(i, i + 1)), 4);
        } else if (data2.length - i == 2) {
          buffer.put(strToNum(data2.substring(i, i + 2)), 7);
        }
      }
    };
    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i));
      }
      return num;
    };
    var chatToNum = function(c) {
      if ("0" <= c && c <= "9") {
        return c.charCodeAt(0) - "0".charCodeAt(0);
      }
      throw "illegal char :" + c;
    };
    return _this;
  };
  var qrAlphaNum = function(data) {
    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;
    var _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _data.length;
    };
    _this.write = function(buffer) {
      var s = _data;
      var i = 0;
      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
          11
        );
        i += 2;
      }
      if (i < s.length) {
        buffer.put(getCode(s.charAt(i)), 6);
      }
    };
    var getCode = function(c) {
      if ("0" <= c && c <= "9") {
        return c.charCodeAt(0) - "0".charCodeAt(0);
      } else if ("A" <= c && c <= "Z") {
        return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
      } else {
        switch (c) {
          case " ":
            return 36;
          case "$":
            return 37;
          case "%":
            return 38;
          case "*":
            return 39;
          case "+":
            return 40;
          case "-":
            return 41;
          case ".":
            return 42;
          case "/":
            return 43;
          case ":":
            return 44;
          default:
            throw "illegal char :" + c;
        }
      }
    };
    return _this;
  };
  var qr8BitByte = function(data) {
    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode2.stringToBytes(data);
    var _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return _bytes.length;
    };
    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };
    return _this;
  };
  var qrKanji = function(data) {
    var _mode = QRMode.MODE_KANJI;
    var _data = data;
    var stringToBytes = qrcode2.stringToBytesFuncs["SJIS"];
    if (!stringToBytes) {
      throw "sjis not supported.";
    }
    !function(c, code) {
      var test = stringToBytes(c);
      if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
        throw "sjis not supported.";
      }
    }("\u53CB", 38726);
    var _bytes = stringToBytes(data);
    var _this = {};
    _this.getMode = function() {
      return _mode;
    };
    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };
    _this.write = function(buffer) {
      var data2 = _bytes;
      var i = 0;
      while (i + 1 < data2.length) {
        var c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
        if (33088 <= c && c <= 40956) {
          c -= 33088;
        } else if (57408 <= c && c <= 60351) {
          c -= 49472;
        } else {
          throw "illegal char at " + (i + 1) + "/" + c;
        }
        c = (c >>> 8 & 255) * 192 + (c & 255);
        buffer.put(c, 13);
        i += 2;
      }
      if (i < data2.length) {
        throw "illegal char at " + (i + 1);
      }
    };
    return _this;
  };
  var byteArrayOutputStream = function() {
    var _bytes = [];
    var _this = {};
    _this.writeByte = function(b) {
      _bytes.push(b & 255);
    };
    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };
    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };
    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i));
      }
    };
    _this.toByteArray = function() {
      return _bytes;
    };
    _this.toString = function() {
      var s = "";
      s += "[";
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ",";
        }
        s += _bytes[i];
      }
      s += "]";
      return s;
    };
    return _this;
  };
  var base64EncodeOutputStream = function() {
    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = "";
    var _this = {};
    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 63));
    };
    var encode = function(n) {
      if (n < 0) {
      } else if (n < 26) {
        return 65 + n;
      } else if (n < 52) {
        return 97 + (n - 26);
      } else if (n < 62) {
        return 48 + (n - 52);
      } else if (n == 62) {
        return 43;
      } else if (n == 63) {
        return 47;
      }
      throw "n:" + n;
    };
    _this.writeByte = function(n) {
      _buffer = _buffer << 8 | n & 255;
      _buflen += 8;
      _length += 1;
      while (_buflen >= 6) {
        writeEncoded(_buffer >>> _buflen - 6);
        _buflen -= 6;
      }
    };
    _this.flush = function() {
      if (_buflen > 0) {
        writeEncoded(_buffer << 6 - _buflen);
        _buffer = 0;
        _buflen = 0;
      }
      if (_length % 3 != 0) {
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += "=";
        }
      }
    };
    _this.toString = function() {
      return _base64;
    };
    return _this;
  };
  var base64DecodeInputStream = function(str) {
    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;
    var _this = {};
    _this.read = function() {
      while (_buflen < 8) {
        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw "unexpected end of file./" + _buflen;
        }
        var c = _str.charAt(_pos);
        _pos += 1;
        if (c == "=") {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/)) {
          continue;
        }
        _buffer = _buffer << 6 | decode(c.charCodeAt(0));
        _buflen += 6;
      }
      var n = _buffer >>> _buflen - 8 & 255;
      _buflen -= 8;
      return n;
    };
    var decode = function(c) {
      if (65 <= c && c <= 90) {
        return c - 65;
      } else if (97 <= c && c <= 122) {
        return c - 97 + 26;
      } else if (48 <= c && c <= 57) {
        return c - 48 + 52;
      } else if (c == 43) {
        return 62;
      } else if (c == 47) {
        return 63;
      } else {
        throw "c:" + c;
      }
    };
    return _this;
  };
  var gifImage = function(width, height) {
    var _width = width;
    var _height = height;
    var _data = new Array(width * height);
    var _this = {};
    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };
    _this.write = function(out) {
      out.writeString("GIF87a");
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(128);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(0);
      out.writeByte(255);
      out.writeByte(255);
      out.writeByte(255);
      out.writeString(",");
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);
      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);
      out.writeByte(lzwMinCodeSize);
      var offset = 0;
      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }
      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0);
      out.writeString(";");
    };
    var bitOutputStream = function(out) {
      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;
      var _this2 = {};
      _this2.write = function(data, length) {
        if (data >>> length != 0) {
          throw "length over";
        }
        while (_bitLength + length >= 8) {
          _out.writeByte(255 & (data << _bitLength | _bitBuffer));
          length -= 8 - _bitLength;
          data >>>= 8 - _bitLength;
          _bitBuffer = 0;
          _bitLength = 0;
        }
        _bitBuffer = data << _bitLength | _bitBuffer;
        _bitLength = _bitLength + length;
      };
      _this2.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };
      return _this2;
    };
    var getLZWRaster = function(lzwMinCodeSize) {
      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;
      var table = lzwTable();
      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i));
      }
      table.add(String.fromCharCode(clearCode));
      table.add(String.fromCharCode(endCode));
      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);
      bitOut.write(clearCode, bitLength);
      var dataIndex = 0;
      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;
      while (dataIndex < _data.length) {
        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;
        if (table.contains(s + c)) {
          s = s + c;
        } else {
          bitOut.write(table.indexOf(s), bitLength);
          if (table.size() < 4095) {
            if (table.size() == 1 << bitLength) {
              bitLength += 1;
            }
            table.add(s + c);
          }
          s = c;
        }
      }
      bitOut.write(table.indexOf(s), bitLength);
      bitOut.write(endCode, bitLength);
      bitOut.flush();
      return byteOut.toByteArray();
    };
    var lzwTable = function() {
      var _map = {};
      var _size = 0;
      var _this2 = {};
      _this2.add = function(key) {
        if (_this2.contains(key)) {
          throw "dup key:" + key;
        }
        _map[key] = _size;
        _size += 1;
      };
      _this2.size = function() {
        return _size;
      };
      _this2.indexOf = function(key) {
        return _map[key];
      };
      _this2.contains = function(key) {
        return typeof _map[key] != "undefined";
      };
      return _this2;
    };
    return _this;
  };
  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y));
      }
    }
    var b = byteArrayOutputStream();
    gif.write(b);
    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();
    return "data:image/gif;base64," + base64;
  };
  return qrcode2;
}();
!function() {
  qrcode.stringToBytesFuncs["UTF-8"] = function(s) {
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i = 0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 128) utf8.push(charcode);
        else if (charcode < 2048) {
          utf8.push(
            192 | charcode >> 6,
            128 | charcode & 63
          );
        } else if (charcode < 55296 || charcode >= 57344) {
          utf8.push(
            224 | charcode >> 12,
            128 | charcode >> 6 & 63,
            128 | charcode & 63
          );
        } else {
          i++;
          charcode = 65536 + ((charcode & 1023) << 10 | str.charCodeAt(i) & 1023);
          utf8.push(
            240 | charcode >> 18,
            128 | charcode >> 12 & 63,
            128 | charcode >> 6 & 63,
            128 | charcode & 63
          );
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };
}();
var qrcode_default = qrcode;

// pages.js
var SITE = "https://www.chalet-bellevue.fr";
var esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var paras = (t) => String(t || "").trim().split(/\n\s*\n/).filter(Boolean).map((p) => "<p>" + esc(p.trim()).replace(/\n/g, "<br>") + "</p>").join("");
var eur = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
var fd = (iso) => iso ? (/* @__PURE__ */ new Date(iso.slice(0, 10) + "T12:00:00Z")).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "\u2014";
var fdc = (iso) => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "\u2014";
var telLien = (t) => esc(t).replace(/(\+?\d[\d .]{7,}\d)/g, (m) => '<a href="tel:' + m.replace(/[^\d+]/g, "") + '">' + m + "</a>");
var CSS = `
:root{--vert:#1F3D2B;--vert2:#2A4D38;--ocre:#B98D46;--terre:#C0693E;--creme:#FAF6EF;--texte:#22302A;--gris:#5F6B64;--bord:#E5DED0;--ok:#2E6B3A}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--creme);color:var(--texte);font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--vert2)}
.top{background:var(--vert);color:#fff}.top .in{max-width:880px;margin:0 auto;padding:14px 16px;display:flex;align-items:center;gap:10px}
.top a{color:#fff;text-decoration:none;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:19px}
.top .dot{width:10px;height:10px;border-radius:50%;background:var(--ocre)}
main{max-width:880px;margin:0 auto;padding:28px 16px 48px}
h1{font-family:Fraunces,Georgia,serif;color:var(--vert);font-size:clamp(26px,5vw,36px);line-height:1.15;margin:0 0 6px}
h2{font-family:Fraunces,Georgia,serif;color:var(--vert);font-size:22px;margin:0 0 12px}
.sous{color:var(--gris);margin:0 0 24px}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:var(--terre);font-weight:600;margin:0 0 6px}
.carte{background:#fff;border:1px solid var(--bord);border-radius:14px;padding:22px;margin:0 0 18px}
.grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
.k{font-size:13px;color:var(--gris)}.v{font-weight:600}
table{width:100%;border-collapse:collapse;font-size:15px}td{padding:9px 0;border-top:1px solid #F0EADF;vertical-align:top}td.r{text-align:right;white-space:nowrap;padding-left:12px}
tr.tot td{font-weight:700;border-top:2px solid var(--vert)}
.badge{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px}
.b-ok{background:#DDF0DF;color:var(--ok)}.b-av{background:#FFF1C9;color:#8A5A00}.b-re{background:#F8E1DA;color:#A33E22}
.doc{max-height:360px;overflow:auto;border:1px solid var(--bord);border-radius:10px;padding:14px 16px;background:#FDFBF7;font-size:14.5px}
.doc h3{font-family:Fraunces,Georgia,serif;color:var(--vert);font-size:17px;margin:14px 0 6px}
label{display:block;font-size:14px;color:var(--gris);margin:14px 0 6px}
input[type=text]{width:100%;font:inherit;padding:11px 12px;border:1px solid var(--bord);border-radius:10px;background:#fff}
.coche{display:flex;gap:10px;align-items:flex-start;color:var(--texte);font-size:15px}.coche input{margin-top:4px;width:18px;height:18px;flex:none}
.btn{display:inline-block;font:600 16px Inter,system-ui,sans-serif;border:0;border-radius:999px;padding:13px 22px;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:var(--terre);color:#fff}.btn-p:hover{background:#A9592F}.btn-v{background:var(--vert);color:#fff}
.btns{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.msg{border-radius:12px;padding:14px 16px;margin:0 0 18px;font-weight:500}.m-ok{background:#DDF0DF;color:#1F4D2A}.m-err{background:#F8E1DA;color:#7A2A15}.m-info{background:#E3ECF7;color:#1F4E7A}
.wifi{background:var(--vert);color:#fff;border-radius:14px;padding:20px 22px;margin:0 0 18px}.wifi .k{color:#C9D6CC}.wifi .v{font-size:22px;font-family:ui-monospace,Menlo,monospace;word-break:break-all}
.pied{color:var(--gris);font-size:14px;text-align:center;margin-top:28px}
@media print{.top,.btns,form{display:none}body{background:#fff}.carte{border:0;padding:0}}
`;
function page(titre, corps, o = {}) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titre)} \u2014 Chalet Bellevue</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="alternate icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><header class="top"><div class="in"><span class="dot"></span><a href="${SITE}/">Chalet Bellevue</a></div></header>
<main>${corps}</main></body></html>`, {
    status: o.status || 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, private", "referrer-policy": "same-origin", "x-robots-tag": "noindex", "x-frame-options": "DENY" }
  });
}
var introuvable = () => page("Lien introuvable", `<p class="eyebrow">Chalet Bellevue</p><h1>Ce lien n'est pas (ou plus) valable</h1><p class="sous">V\xE9rifiez l'adresse re\xE7ue par e-mail, ou contactez l'association.</p><a class="btn btn-v" href="${SITE}/contact">Nous contacter</a>`, { status: 404 });
var indisponible = () => page("Service indisponible", `<h1>Service momentan\xE9ment indisponible</h1><p class="sous">Merci de r\xE9essayer dans quelques minutes.</p>`, { status: 503 });
async function appel(env, methode, params, corps) {
  const url = new URL(env.LOGICIEL_URL.replace(/\/site\/?$/, "/client"));
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const r = await fetch(url, {
    method: methode,
    signal: AbortSignal.timeout(15e3),
    headers: { "x-site-secret": env.SITE_SECRET, "content-type": "application/json", accept: "application/json" },
    body: corps ? JSON.stringify(corps) : void 0
  });
  let j = null;
  try {
    j = await r.json();
  } catch (e) {
  }
  return { status: r.status, data: j || {} };
}
function memeOrigine(request) {
  const o = request.headers.get("origin");
  return !o || o === SITE || o === "https://chalet-bellevue.fr";
}
var redirige = (u) => new Response(null, { status: 303, headers: { location: u, "cache-control": "no-store" } });
function pageConnexion(email, erreur) {
  return page("Mon espace s\xE9jour", `<p class="eyebrow">Espace s\xE9jour</p><h1>Acc\xE9der \xE0 mon s\xE9jour</h1>
<p class="sous">Saisissez l'adresse e-mail utilis\xE9e pour la demande et le code d'acc\xE8s \xE0 6 caract\xE8res re\xE7u par e-mail.</p>
${erreur ? `<div class="msg m-err">Adresse e-mail ou code incorrect. V\xE9rifiez le code re\xE7u par e-mail (lettres majuscules et chiffres).</div>` : ""}
<section class="carte" style="max-width:520px"><form method="post" action="/sejour/connexion">
<label for="email">Adresse e-mail</label><input type="text" inputmode="email" id="email" name="email" required autocomplete="email" value="${esc(email)}">
<label for="code">Code d'acc\xE8s</label><input type="text" id="code" name="code" required minlength="6" maxlength="8" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" style="letter-spacing:.25em;font-family:ui-monospace,Menlo,monospace;text-transform:uppercase">
<div class="btns"><button class="btn btn-v" type="submit">Acc\xE9der \xE0 mon s\xE9jour</button></div></form>
<p class="k" style="margin-top:14px">Code perdu ? R\xE9pondez simplement \xE0 l'e-mail re\xE7u, l'association vous le renverra.</p></section>
<a href="/login" class="acces-membre" title="Acc\xE8s membre (adh\xE9rents de l'association)" style="max-width:520px;display:flex;align-items:center;gap:14px;padding:16px 20px;border:2px solid var(--vert);border-radius:14px;background:#fff;color:var(--vert);text-decoration:none;margin-top:4px">
<span style="width:46px;height:46px;flex:none;border-radius:12px;background:var(--vert);color:#fff;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
<span style="flex:1"><b style="display:block;font-size:18px">Acc\xE8s membre</b><span style="font-size:14px;color:var(--gris)">Adh\xE9rents et bureau de l'association : connexion \xE0 l'espace membres</span></span>
<span aria-hidden="true" style="font-size:22px">\u203A</span></a>`, { status: erreur ? 401 : 200 });
}
function joursSejour(debut, fin) {
  const out = [];
  for (let d = debut; d && fin && d <= fin && out.length < 60; d = new Date(Date.parse(d + "T12:00:00Z") + 864e5).toISOString().slice(0, 10)) out.push(d);
  return out;
}
function sectionOrganisation(d, base) {
  const donnees = {
    chambres: d.chambres,
    couchage: d.couchage || {},
    programme: d.programme || { taches: [], activites: [] },
    suggestions: d.suggestions || [],
    jours: joursSejour(d.debut, d.fin).map((j) => [j, (/* @__PURE__ */ new Date(j + "T12:00:00Z")).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })]),
    url: base + "/espace",
    personnes: d.personnes
  };
  return `<section class="carte" id="organisation"><h2>Organisation du s\xE9jour</h2>
<p class="k" style="margin:-4px 0 14px">\xC0 remplir ensemble : tout est enregistr\xE9 automatiquement et partag\xE9 avec toutes les personnes qui ont ce lien. <span id="org-etat"></span></p>
<h3 class="org-t">\u{1F6CF}\uFE0F Qui dort o\xF9 ?</h3><p class="k" id="org-places"></p><div class="org-ch" id="org-ch"></div>
<h3 class="org-t">\u2705 \xC0 faire avant et pendant le s\xE9jour</h3><div id="org-taches"></div>
<form class="org-aj" data-l="taches"><input type="text" maxlength="160" placeholder="Ex. : courses du premier soir, apporter les draps\u2026"><button class="btn btn-v" type="submit">Ajouter</button></form>
<h3 class="org-t">\u{1F97E} Nos activit\xE9s</h3><div id="org-act"></div>
<form class="org-aj" data-l="activites"><input type="text" maxlength="160" placeholder="Une activit\xE9, une sortie, un repas\u2026"><button class="btn btn-v" type="submit">Ajouter</button></form>
<div class="org-sug" id="org-sug"></div></section>
<style>${CSS_ORGA}</style>
<script type="application/json" id="org-donnees">${JSON.stringify(donnees).replace(/</g, "\\u003c")}</script>
<script>${JS_ORGA}</script>`;
}
var CSS_ORGA = `
.org-t{font-family:Fraunces,Georgia,serif;color:var(--vert);font-size:18px;margin:22px 0 8px}
.org-ch{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.org-c{border:1px solid var(--bord);border-radius:12px;padding:12px;background:#FDFBF7}.org-c b{display:block;margin-bottom:6px;color:var(--vert)}
.org-c input{width:100%;font:inherit;font-size:15px;padding:8px 10px;border:1px solid var(--bord);border-radius:8px;margin:3px 0;background:#fff}
.org-li{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #F0EADF}
.org-li input[type=checkbox]{width:20px;height:20px;flex:none;accent-color:#1F3D2B}
.org-li .t{flex:1;min-width:0;word-break:break-word}.org-li.fait .t{text-decoration:line-through;color:var(--gris)}
.org-li select{font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--bord);border-radius:8px;background:#fff;max-width:140px}
.org-x{border:0;background:none;color:#A33E22;font-size:20px;cursor:pointer;padding:0 4px;line-height:1}
.org-aj{display:flex;gap:8px;margin-top:10px}.org-aj input{flex:1;min-width:0}.org-aj .btn{padding:10px 16px;font-size:15px}
.org-sug{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.org-sug button{border:1px dashed var(--ocre);background:#fff;color:var(--vert2);border-radius:999px;padding:6px 12px;font:inherit;font-size:14px;cursor:pointer}
.org-vide{color:var(--gris);font-size:14px;margin:4px 0}
@media print{.org-aj,.org-sug,.org-x{display:none}}
`;
var JS_ORGA = `(function(){
var D=JSON.parse(document.getElementById("org-donnees").textContent);
var C=D.couchage||{},P={taches:(D.programme.taches||[]).slice(),activites:(D.programme.activites||[]).slice()};
var etat=document.getElementById("org-etat"),minu=null;
function e(t){return String(t).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function id(){return Math.random().toString(36).slice(2,10)}
function sauver(){etat.textContent="Enregistrement\u2026";clearTimeout(minu);minu=setTimeout(function(){fetch(D.url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({couchage:C,programme:P})}).then(function(r){etat.textContent=r.ok?"\u2713 Enregistr\xE9":"\u26A0 Non enregistr\xE9, r\xE9essayez"}).catch(function(){etat.textContent="\u26A0 Pas de connexion, r\xE9essayez"})},700)}
function places(){var n=0,l=0;D.chambres.forEach(function(ch){l+=ch.lits;(C[ch.id]||[]).forEach(function(x){if(x&&x.trim())n++})});document.getElementById("org-places").textContent=n+" personne"+(n>1?"s":"")+" plac\xE9e"+(n>1?"s":"")+" sur "+D.personnes+" \xB7 "+l+" lits"}
var ch=document.getElementById("org-ch");
D.chambres.forEach(function(c){var d=document.createElement("div");d.className="org-c";var h="<b>"+e(c.nom)+" \xB7 "+c.lits+" lit"+(c.lits>1?"s":"")+"</b>";for(var i=0;i<c.lits;i++)h+='<input type="text" maxlength="60" data-c="'+e(c.id)+'" data-i="'+i+'" placeholder="Lit '+(i+1)+' : pr\xE9nom" value="'+e((C[c.id]||[])[i]||"")+'">';d.innerHTML=h;ch.appendChild(d)});
ch.addEventListener("input",function(ev){var t=ev.target;if(!t.dataset.c)return;var a=(C[t.dataset.c]||[]).slice();a[+t.dataset.i]=t.value;C[t.dataset.c]=a;places();sauver()});
function liste(cle,el,jour){var b=document.getElementById(el);if(!P[cle].length){b.innerHTML='<p class="org-vide">Rien pour l\u2019instant.</p>';return}
b.innerHTML=P[cle].map(function(x,i){var s="";if(jour){s='<select data-k="'+cle+'" data-j="'+i+'"><option value="">Jour ?</option>'+D.jours.map(function(j){return'<option value="'+j[0]+'"'+(x.jour===j[0]?" selected":"")+">"+e(j[1])+"</option>"}).join("")+"</select>"}
return'<div class="org-li'+(x.fait?" fait":"")+'"><input type="checkbox" data-k="'+cle+'" data-f="'+i+'"'+(x.fait?" checked":"")+' aria-label="Fait"><span class="t">'+e(x.t)+"</span>"+s+'<button class="org-x" data-k="'+cle+'" data-x="'+i+'" title="Supprimer" aria-label="Supprimer">\xD7</button></div>'}).join("")}
function tout(){liste("taches","org-taches",false);liste("activites","org-act",true);var deja={};P.activites.forEach(function(a){deja[a.t.toLowerCase()]=1});document.getElementById("org-sug").innerHTML=D.suggestions.filter(function(s){return!deja[s.toLowerCase()]}).map(function(s){return'<button type="button" data-s="'+e(s)+'">+ '+e(s)+"</button>"}).join("")}
document.getElementById("organisation").addEventListener("click",function(ev){var t=ev.target;
if(t.dataset.x!=null){P[t.dataset.k].splice(+t.dataset.x,1);tout();sauver()}
else if(t.dataset.f!=null){P[t.dataset.k][+t.dataset.f].fait=t.checked;tout();sauver()}
else if(t.dataset.s!=null){P.activites.push({id:id(),t:t.dataset.s,jour:"",fait:false});tout();sauver()}});
document.getElementById("organisation").addEventListener("change",function(ev){var t=ev.target;if(t.dataset.j!=null){P[t.dataset.k][+t.dataset.j].jour=t.value;sauver()}});
Array.prototype.forEach.call(document.querySelectorAll(".org-aj"),function(f){f.addEventListener("submit",function(ev){ev.preventDefault();var i=f.querySelector("input"),v=i.value.trim();if(!v)return;P[f.dataset.l].push(f.dataset.l==="activites"?{id:id(),t:v,jour:"",fait:false}:{id:id(),t:v,fait:false});i.value="";tout();sauver()})});
places();tout();
})();`;
var ETAT = { paye: ["R\xE9gl\xE9", "b-ok"], avenir: ["\xC0 r\xE9gler", "b-av"], retard: ["En retard", "b-re"] };
function vueSejour(d, jeton, msg) {
  const base = "/sejour/" + jeton;
  const acc = d.contrat && d.contrat.accepte;
  const e = d.echeancier || [];
  const acompte = e.find((x) => x.type === "acompte"), solde = e.find((x) => x.type === "solde");
  const lignes = (d.detail || []).length ? d.detail : [{ lib: "Location du chalet", montant: d.total }];
  let h = (msg || "") + `<p class="eyebrow">Votre espace s\xE9jour</p><h1>${esc(d.chalet)} \u2014 ${esc(d.ville)}</h1>
<p class="sous">${esc(d.groupe || d.contact)}${d.groupe && d.contact ? " \xB7 " + esc(d.contact) : ""}</p>
<section class="carte"><h2>Votre s\xE9jour</h2><div class="grille">
<div><div class="k">Arriv\xE9e</div><div class="v">${esc(fd(d.debut))}</div></div>
<div><div class="k">D\xE9part</div><div class="v">${esc(fd(d.fin))}</div></div>
<div><div class="k">Dur\xE9e</div><div class="v">${d.nuits} nuit${d.nuits > 1 ? "s" : ""}</div></div>
<div><div class="k">Personnes</div><div class="v">${d.personnes}</div></div></div>
${d.statut === "demande" || d.statut === "option" ? `<p class="msg m-info" style="margin:16px 0 0">Votre demande est en cours d'examen par l'association. Vous recevrez une confirmation par e-mail.</p>` : ""}</section>`;
  if (d.total > 0) {
    h += `<section class="carte"><h2>Montant et r\xE8glement</h2><table>${lignes.map((l) => `<tr><td>${esc(l.lib)}</td><td class="r">${eur(l.montant)}</td></tr>`).join("")}
<tr class="tot"><td>Total</td><td class="r">${eur(d.total)}</td></tr></table>
<table style="margin-top:14px">${e.map((x) => `<tr><td>${esc(x.lib)}<div class="k">${x.etat === "paye" ? "" : "Avant le " + fdc(x.du)}</div></td><td class="r">${eur(x.montant)}<br><span class="badge ${ETAT[x.etat][1]}">${ETAT[x.etat][0]}</span></td></tr>`).join("")}
${d.caution ? `<tr><td>Caution<div class="k">Remise \xE0 l'arriv\xE9e, restitu\xE9e apr\xE8s l'\xE9tat des lieux</div></td><td class="r">${eur(d.caution)}</td></tr>` : ""}</table>
<p class="k" style="margin:12px 0 0">D\xE9j\xE0 r\xE9gl\xE9 : <b>${eur(d.paye)}</b> \xB7 Reste \xE0 r\xE9gler : <b>${eur(d.reste)}</b></p></section>`;
  }
  h += `<section class="carte" id="contrat"><h2>Contrat de location</h2>
<div class="doc"><h3>Conditions de location</h3>${paras(d.contrat.conditions)}<h3>R\xE8glement int\xE9rieur</h3>${paras(d.contrat.reglement)}</div>`;
  if (acc) {
    h += `<p class="msg m-ok" style="margin:16px 0 0">\u2713 Contrat accept\xE9 en ligne le ${esc(new Date(acc.le).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" }))} par ${esc(acc.nom)}.</p>`;
  } else {
    h += `<form method="post" action="${base}/accepter"><label for="nom">Nom et pr\xE9nom du signataire</label>
<input type="text" id="nom" name="nom" required minlength="2" maxlength="120" autocomplete="name" value="${esc(d.contact)}">
<label class="coche"><input type="checkbox" name="accepte" required> J'ai lu et j'accepte les conditions de location et le r\xE8glement int\xE9rieur, au nom du groupe.</label>
<div class="btns"><button class="btn btn-v" type="submit">Accepter le contrat</button></div></form>`;
  }
  h += `</section>`;
  if (d.reste > 0 && d.statut !== "demande") {
    h += `<section class="carte" id="paiement"><h2>Paiement</h2>`;
    if (!d.paiementEnLigne) {
      h += `<p>Le r\xE8glement se fait par virement ou par ch\xE8que, selon les indications de l'association.</p>`;
    } else if (!acc) {
      h += `<p>Le paiement en ligne sera disponible d\xE8s que vous aurez accept\xE9 le contrat ci-dessus.</p>`;
    } else {
      h += `<p>Paiement s\xE9curis\xE9 par carte bancaire avec <b>HelloAsso</b>, la plateforme de paiement des associations.</p><div class="btns">`;
      if (acompte && acompte.reste > 0) h += `<form method="post" action="${base}/payer"><input type="hidden" name="type" value="acompte"><button class="btn btn-p" type="submit">Payer l'acompte : ${eur(acompte.reste)}</button></form>`;
      if (d.reste > 0 && (!acompte || acompte.reste <= 0 || solde && d.reste > acompte.reste)) h += `<form method="post" action="${base}/payer"><input type="hidden" name="type" value="solde"><button class="btn ${acompte && acompte.reste > 0 ? "btn-v" : "btn-p"}" type="submit">${acompte && acompte.reste > 0 ? "Tout r\xE9gler" : "Payer le solde"} : ${eur(d.reste)}</button></form>`;
      h += `</div><p class="k" style="margin-top:10px">HelloAsso est gratuit pour l'association ; une contribution volontaire au fonctionnement de HelloAsso peut vous \xEAtre propos\xE9e, vous pouvez la mettre \xE0 0 \u20AC.</p>`;
    }
    h += `</section>`;
  }
  if (d.statut !== "demande" && Array.isArray(d.chambres)) h += sectionOrganisation(d, base);
  h += `<p class="pied">${esc(d.asso)}${d.tel ? " \xB7 " + telLien(d.tel) : ""}${d.email ? ` \xB7 <a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : ""}</p>`;
  return h;
}
async function routeSejour(request, env, url) {
  if (/^\/sejour\/?$/.test(url.pathname) || url.pathname === "/sejour/connexion") {
    if (request.method === "POST" && url.pathname === "/sejour/connexion") {
      if (!memeOrigine(request)) return new Response("Origine refus\xE9e", { status: 403 });
      const f = await request.formData().catch(() => null);
      const email = f ? String(f.get("email") || "").trim().slice(0, 200) : "", code = f ? String(f.get("code") || "").trim().slice(0, 20) : "";
      const r2 = email && code ? await appel(env, "POST", null, { action: "connexion", email, code }) : { status: 400, data: {} };
      if (r2.status === 200 && /^[a-f0-9]{24,64}$/.test(r2.data.jeton || "")) return redirige("/sejour/" + r2.data.jeton);
      await new Promise((ok) => setTimeout(ok, 1e3));
      return pageConnexion(email, true);
    }
    return pageConnexion("", false);
  }
  const m = /^\/sejour\/([a-f0-9]{24,64})(\/(accepter|payer|espace))?\/?$/.exec(url.pathname);
  if (!m) return introuvable();
  const jeton = m[1], action = m[3];
  if (request.method === "POST" && action === "espace") {
    if (!memeOrigine(request)) return new Response("Origine refus\xE9e", { status: 403 });
    const b = await request.json().catch(() => null);
    if (!b) return new Response(JSON.stringify({ error: "Demande incompl\xE8te." }), { status: 400, headers: { "content-type": "application/json" } });
    const r2 = await appel(env, "POST", null, { action: "espace", jeton, couchage: b.couchage, programme: b.programme });
    return new Response(JSON.stringify(r2.data || {}), { status: r2.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (request.method === "POST") {
    if (!memeOrigine(request)) return new Response("Origine refus\xE9e", { status: 403 });
    const f = await request.formData().catch(() => null);
    if (!f) return redirige("/sejour/" + jeton);
    if (action === "accepter") {
      if (!f.get("accepte")) return redirige("/sejour/" + jeton + "?err=coche#contrat");
      const r2 = await appel(env, "POST", null, { action: "accepter", jeton, nom: String(f.get("nom") || ""), ip: request.headers.get("cf-connecting-ip") || "", ua: request.headers.get("user-agent") || "" });
      return redirige("/sejour/" + jeton + (r2.status === 200 ? "?ok=contrat#paiement" : "?err=contrat#contrat"));
    }
    if (action === "payer") {
      const r2 = await appel(env, "POST", null, { action: "payer", jeton, type: f.get("type") === "solde" ? "solde" : "acompte" });
      if (r2.status === 200 && r2.data.url && /^https:\/\/[\w.-]*helloasso(-sandbox)?\.com\//.test(r2.data.url)) return redirige(r2.data.url);
      return redirige("/sejour/" + jeton + "?err=paiement&detail=" + encodeURIComponent(String(r2.data.error || "").slice(0, 160)) + "#paiement");
    }
    return redirige("/sejour/" + jeton);
  }
  if (action) return redirige("/sejour/" + jeton);
  let msg = "";
  const p = url.searchParams;
  if (p.get("paiement") === "retour") {
    const v = await appel(env, "POST", null, { action: "verifier", jeton, intentId: p.get("checkoutIntentId") || "" });
    msg = v.status === 200 && (v.data.enregistres || []).length ? `<div class="msg m-ok">Merci ! Votre paiement de ${eur(v.data.enregistres.reduce((s, x) => s + x, 0))} a bien \xE9t\xE9 re\xE7u.</div>` : `<div class="msg m-info">Merci ! Votre paiement est en cours de validation ; il appara\xEEtra ici dans quelques minutes.</div>`;
  } else if (p.get("paiement") === "erreur") msg = `<div class="msg m-err">Le paiement n'a pas abouti. Aucun montant n'a \xE9t\xE9 d\xE9bit\xE9 ; vous pouvez r\xE9essayer.</div>`;
  else if (p.get("ok") === "contrat") msg = `<div class="msg m-ok">Merci, le contrat est accept\xE9.</div>`;
  else if (p.get("err") === "coche") msg = `<div class="msg m-err">Merci de cocher la case d'acceptation.</div>`;
  else if (p.get("err") === "contrat") msg = `<div class="msg m-err">L'acceptation n'a pas pu \xEAtre enregistr\xE9e. Merci de r\xE9essayer.</div>`;
  else if (p.get("err") === "paiement") msg = `<div class="msg m-err">${esc(p.get("detail") || "Le paiement en ligne est momentan\xE9ment indisponible.")}</div>`;
  const r = await appel(env, "GET", { jeton });
  if (r.status === 404 || r.status === 400) return introuvable();
  if (r.status !== 200) return indisponible();
  if (r.data.annulee) return page("R\xE9servation annul\xE9e", `<h1>Cette r\xE9servation a \xE9t\xE9 annul\xE9e</h1><p class="sous">Pour toute question, contactez l'association.</p>`);
  return page("Votre s\xE9jour", vueSejour(r.data, jeton, msg));
}
function qrSvg(texte, taille) {
  const q = qrcode_default(0, "M");
  q.addData(texte);
  q.make();
  const n = q.getModuleCount(), m = 4, t = n + m * 2;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" width="${taille}" height="${taille}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#1F3D2B"/></svg>`;
}
function nettoie(t) {
  const l = String(t || "").split("\n");
  return l.filter((x, i) => {
    if (!/:\s*$/.test(x.trim())) return true;
    const suite = l.slice(i + 1).find((y) => y.trim());
    return !!suite && /^[•\-–*☐□]/.test(suite.trim());
  }).join("\n");
}
function bloc(t) {
  return nettoie(t).trim().split(/\n\s*\n/).filter(Boolean).map((b) => {
    const lignes = b.split("\n").map((l) => l.trim()).filter(Boolean);
    let html = "", liste = [], coche = false;
    const vider = () => {
      if (liste.length) {
        html += `<ul class="${coche ? "cases" : "puces"}">` + liste.map((x) => "<li>" + x + "</li>").join("") + "</ul>";
        liste = [];
      }
    };
    for (const l of lignes) {
      const m = /^([•\-–*☐□])\s*(.*)$/.exec(l);
      if (m) {
        coche = /[☐□]/.test(m[1]);
        liste.push(telLien(m[2]));
      } else {
        vider();
        html += "<p>" + telLien(l) + "</p>";
      }
    }
    vider();
    return html;
  }).join("");
}
var ancre = (t, i) => "r" + i + "-" + String(t).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
function rubriques(d) {
  const r = [], secs = (d.sections || []).slice();
  if (secs.length && /^bienvenue/i.test(secs[0].titre)) r.push(secs.shift());
  if (d.arrivee) r.push({ titre: "Votre arriv\xE9e", texte: `Arriv\xE9e \xE0 partir de ${d.heureArrivee}.` + (d.adresse ? `
Adresse : ${d.adresse}` : "") + "\n\n" + d.arrivee });
  secs.forEach((x) => {
    if (nettoie(x.texte).trim()) r.push(x);
  });
  if (!d.sections || !d.sections.length) {
    if (d.infos) r.push({ titre: "Infos pratiques", texte: d.infos });
  }
  if (d.consignes) r.push({ titre: "Avant de partir", texte: `D\xE9part avant ${d.heureDepart}.

` + d.consignes, depart: true });
  r.push({ titre: "Num\xE9ros utiles", texte: (d.tel && !String(d.numeros || "").replace(/\D/g, "").includes(String(d.tel).replace(/\D/g, "")) ? `${d.asso} : ${d.tel}
` : "") + (d.numeros ? d.numeros + "\n" : "") + "\nUrgences : 112 \xB7 SAMU : 15 \xB7 Pompiers : 18 \xB7 Gendarmerie : 17" });
  if (d.reglement) r.push({ titre: "R\xE8glement int\xE9rieur", texte: d.reglement });
  return r;
}
var CSS_LIVRET = `
.hero{background:var(--vert);color:#fff;border-radius:18px;padding:26px 22px;margin:0 0 16px}.hero h1{color:#fff;margin:4px 0 8px}.hero .eyebrow{color:#E9C98F}.hero p{margin:0;color:#D8E3DA}
.faits{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:0 0 16px}.fait{background:#fff;border:1px solid var(--bord);border-radius:12px;padding:12px 14px}.fait .k{font-size:12px}.fait .v{font-size:18px;font-family:Fraunces,Georgia,serif;color:var(--vert)}
.sommaire{display:flex;gap:8px;overflow-x:auto;padding:2px 0 12px;margin:0 0 6px;scrollbar-width:none}.sommaire a{flex:none;background:#fff;border:1px solid var(--bord);border-radius:999px;padding:7px 13px;font-size:14px;text-decoration:none;color:var(--vert2);white-space:nowrap}
.carte ul{margin:6px 0 10px;padding-left:20px}.carte li{margin:3px 0}ul.cases{list-style:none;padding-left:2px}ul.cases li:before{content:"\u2610";margin-right:8px;color:var(--terre)}
.carte p{margin:6px 0}.carte h2{scroll-margin-top:12px}
`;
async function routeLivret(request, env, url) {
  const k = url.searchParams.get("k") || "";
  if (!/^[a-f0-9]{24,64}$/.test(k)) return introuvable();
  const r = await appel(env, "GET", { livret: k });
  if (r.status === 404) return introuvable();
  if (r.status !== 200) return indisponible();
  const d = r.data, lien = SITE + "/livret?k=" + k;
  const rub = rubriques(d);
  if (url.pathname === "/livret/affiche") {
    return page("Affiche du livret d'accueil", `<style>@page{size:A4;margin:16mm}main{text-align:center}.qr svg{width:min(78vw,330px);height:auto}</style>
<p class="eyebrow">Bienvenue au ${esc(d.chalet)}</p><h1 style="font-size:40px">Livret d'accueil</h1>
<p class="sous" style="font-size:19px">Scannez ce code avec l'appareil photo de votre t\xE9l\xE9phone</p>
<div class="qr">${qrSvg(lien, 330)}</div>
${d.wifiNom ? `<div class="wifi" style="max-width:420px;margin:24px auto 0;text-align:left"><div class="k">Wi-Fi</div><div class="v">${esc(d.wifiNom)}</div>${d.wifiCle ? `<div class="k" style="margin-top:8px">Mot de passe</div><div class="v">${esc(d.wifiCle)}</div>` : ""}</div>` : ""}
<p style="margin-top:24px">Arriv\xE9e d\xE8s ${esc(d.heureArrivee)} \xB7 D\xE9part avant ${esc(d.heureDepart)} \xB7 ${esc(d.asso)}${d.tel ? " : " + esc(d.tel) : ""}</p>
<div class="btns" style="justify-content:center"><button class="btn btn-v" onclick="print()">Imprimer</button></div>`);
  }
  if (url.pathname === "/livret/imprimer") {
    const css = `<style>
@page{size:A4;margin:14mm 14mm 16mm}
body{background:#fff}.top{display:none}main{max-width:none;padding:0}
.couv{min-height:250mm;display:flex;flex-direction:column;justify-content:space-between;border:2px solid var(--vert);border-radius:14px;padding:16mm 14mm;break-after:page;page-break-after:always}
.couv h1{font-size:44px;margin:6px 0}.couv .grand{font-family:Fraunces,Georgia,serif;font-size:26px;color:var(--vert)}
.couv .bas{display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.encadre{border:1px solid var(--bord);border-radius:12px;padding:12px 16px;background:#FDFBF7}
.colonnes{column-count:2;column-gap:12mm}.sec{break-inside:avoid;page-break-inside:avoid;margin:0 0 6mm}
.sec h2{font-size:19px;border-bottom:2px solid var(--ocre);padding-bottom:3px;margin:0 0 6px}.sec p,.sec li{font-size:12.5px;line-height:1.5}.sec ul{margin:4px 0 8px;padding-left:18px}
ul.cases{list-style:none;padding-left:0;columns:2;column-gap:10mm}ul.cases li{break-inside:avoid;margin:0 0 4px}ul.cases li:before{content:"\u2610";margin-right:7px;color:var(--terre)}
.fin{break-before:page;page-break-before:always}.fin .sec{margin-bottom:8mm}.fin .sec p,.fin .sec li{font-size:14px}
.depart{border:2px solid var(--terre);border-radius:12px;padding:10px 14px;background:#FFF8F2}
.ecran{background:#FFF1C9;color:#7A5200;border-radius:12px;padding:12px 16px;margin:0 0 14px}
@media print{.ecran{display:none}}
</style>`;
    const couv = `<section class="couv"><div><p class="eyebrow">${esc(d.asso)}</p><h1>Bienvenue au ${esc(d.chalet)}</h1><div class="grand">Livret d'accueil</div>
<p class="sous" style="margin-top:10px">${esc(d.adresse || d.ville)}</p></div>
<div class="encadre"><b>Arriv\xE9e</b> \xE0 partir de ${esc(d.heureArrivee)} &nbsp;\xB7&nbsp; <b>D\xE9part</b> avant ${esc(d.heureDepart)}${d.wifiNom ? `<br><b>Wi-Fi</b> : ${esc(d.wifiNom)}${d.wifiCle ? ` &nbsp;\xB7&nbsp; <b>Mot de passe</b> : ${esc(d.wifiCle)}` : ""}` : ""}<br><b>Contact</b> : ${esc(d.asso)}${d.tel ? " \u2014 " + esc(d.tel) : ""}${d.email ? " \u2014 " + esc(d.email) : ""}<br><b>Urgences</b> : 112 \xB7 SAMU 15 \xB7 Pompiers 18</div>
<div class="bas"><div style="max-width:60%"><p style="margin:0 0 4px"><b>Ce livret existe aussi sur votre t\xE9l\xE9phone</b></p><p class="k" style="margin:0">Scannez le code pour l'avoir toujours sur vous, avec les liens et num\xE9ros cliquables.</p></div>${qrSvg(lien, 120)}</div></section>`;
    const pleine = (x) => x.depart || x.titre === "Num\xE9ros utiles";
    const sec = (x) => `<section class="sec${x.depart ? " depart" : ""}"><h2>${esc(x.titre)}</h2>${bloc(x.texte)}</section>`;
    const corps = `<div class="colonnes">${rub.filter((x) => !pleine(x)).map(sec).join("")}</div><div class="fin">${rub.filter(pleine).map(sec).join("")}</div>`;
    return page("Livret d'accueil \xE0 imprimer", css + `<div class="ecran">Version \xE0 imprimer (A4). Utilisez \xAB Imprimer \xBB puis \xAB Enregistrer en PDF \xBB ou votre imprimante. <button class="btn btn-v" style="padding:6px 14px;font-size:14px;margin-left:8px" onclick="print()">Imprimer</button></div>` + couv + corps + `<p class="pied">Tr\xE8s bon s\xE9jour ! \u2014 ${esc(d.asso)}</p>`);
  }
  let h = `<style>${CSS_LIVRET}</style><div class="hero"><p class="eyebrow">Livret d'accueil</p><h1>Bienvenue au ${esc(d.chalet)} !</h1><p>${esc(d.adresse || d.ville)}</p></div>
<div class="faits"><div class="fait"><div class="k">Arriv\xE9e</div><div class="v">d\xE8s ${esc(d.heureArrivee)}</div></div><div class="fait"><div class="k">D\xE9part</div><div class="v">avant ${esc(d.heureDepart)}</div></div>${d.tel ? `<div class="fait"><div class="k">${esc(d.asso)}</div><div class="v">${telLien(d.tel)}</div></div>` : ""}</div>`;
  if (d.wifiNom) h += `<div class="wifi"><div class="k">Wi-Fi</div><div class="v">${esc(d.wifiNom)}</div>${d.wifiCle ? `<div class="k" style="margin-top:8px">Mot de passe</div><div class="v" id="cle">${esc(d.wifiCle)}</div><div class="btns"><button class="btn btn-p" type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('cle').textContent).then(function(){this.textContent='Copi\xE9 \u2713'}.bind(this))">Copier le mot de passe</button></div>` : ""}</div>`;
  h += `<nav class="sommaire">${rub.map((x, i) => `<a href="#${ancre(x.titre, i)}">${esc(x.titre)}</a>`).join("")}</nav>`;
  h += rub.map((x, i) => `<section class="carte" id="${ancre(x.titre, i)}"><h2>${esc(x.titre)}</h2>${bloc(x.texte)}</section>`).join("");
  if (d.lienAvis && /^https:\/\//.test(d.lienAvis)) h += `<section class="carte"><h2>Votre avis compte</h2><p>Un petit mot apr\xE8s votre s\xE9jour aide beaucoup l'association.</p><a class="btn btn-v" href="${esc(d.lienAvis)}" rel="noopener">Laisser un avis</a></section>`;
  h += `<p class="pied">Tr\xE8s bon s\xE9jour ! \u2014 ${esc(d.asso)}${d.email ? ` \xB7 <a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : ""}</p>`;
  return page("Livret d'accueil", h);
}

// chat.js
var FICHE = [
  "Chalet Bellevue, g\xE9r\xE9 par l'association A.C.T.E.S (loi 1901). Adresse : Domaine Bellevue, 2 Impasse du Poujaous, 31110 Bagn\xE8res-de-Luchon, \xE0 1 km du centre. Chalet enti\xE8rement ind\xE9pendant, 24 personnes maximum, \xE9tablissement agr\xE9\xE9 Jeunesse et Sport. Animaux accept\xE9s s'ils sont signal\xE9s lors de la r\xE9servation.",
  "Couchages : 6 chambres, 23 lits (22 simples et 1 double). Ch.1 : 3 lits superpos\xE9s (6 places). Ch.2 : 3 lits superpos\xE9s (6 places). Ch.3 : 2 lits superpos\xE9s (4 places). Ch.4 : 2 lits superpos\xE9s + 2 lits 90 cm (6 places). Ch.5 : 2 lits 90 cm (2 places). Ch.6 : 1 lit 140 cm (2 places).",
  "Espaces : salle \xE0 manger de 45 m2, salon de 25 m2, jardin clos de 1500 m2, terrasse, barbecue, salon de jardin, parking priv\xE9 (8 voitures).",
  "\xC9quipements : cuisine \xE9quip\xE9e (2 r\xE9frig\xE9rateurs + 1 cong\xE9lateur, gazini\xE8re 5 feux et four gaz, lave-vaisselle, micro-ondes, 3 appareils \xE0 raclette, 2 cafeti\xE8res, bouilloire, grille-pain), 2 salles d'eau avec 4 douches individuelles, 5 lavabos, 3 WC ind\xE9pendants, s\xE8che-cheveux, t\xE9l\xE9vision, WiFi gratuit, chauffage au gaz, lave-linge et s\xE8che-linge privatifs, mat\xE9riel de repassage.",
  "Moyens de paiement : ch\xE8que, esp\xE8ces, virement, et carte bancaire en ligne (HelloAsso) depuis l'espace s\xE9jour quand il est propos\xE9. Linge de lit et m\xE9nage de fin de s\xE9jour : voir les tarifs ci-dessous.",
  "R\xE9servation : calendrier des disponibilit\xE9s et calcul exact du prix sur la page R\xE9servation du site (www.chalet-bellevue.fr/reservation). La demande est ensuite valid\xE9e par l'association. Apr\xE8s la demande, le client re\xE7oit par e-mail un code d'acc\xE8s \xE0 son espace s\xE9jour (www.chalet-bellevue.fr/sejour) : contrat, paiement, r\xE9partition des chambres, liste de choses \xE0 faire, activit\xE9s.",
  "Environs : Thermes de Luchon (environ 1 km), station de Luchon-Superbagn\xE8res (ski, environ 25 min, 18 km, ou t\xE9l\xE9cabine depuis Luchon), lac d'O\xF4, vall\xE9e du Lys, all\xE9es d'\xC9tigny, march\xE9 de Luchon."
].join("\n");
var eur2 = (n) => (Math.round(Number(n) * 100) / 100).toLocaleString("fr-FR") + " \u20AC";
var MOIS = ["janvier", "f\xE9vrier", "mars", "avril", "mai", "juin", "juillet", "ao\xFBt", "septembre", "octobre", "novembre", "d\xE9cembre"];
function periodeSaison(du, au) {
  const f = (v) => {
    const s = String(v || "");
    const m = Number(s.slice(0, 2));
    const j = s.length >= 5 ? Number(s.slice(3, 5)) : 0;
    return (j ? j + " " : "") + (MOIS[m - 1] || s);
  };
  return f(du) + " \u2192 " + f(au);
}
function connaissances(k) {
  const l = [];
  l.push(`Date du jour : ${k.aujourdhui}.`);
  l.push(`Capacit\xE9 : ${k.capacite} personnes maximum. Arriv\xE9e \xE0 partir de ${k.heureArrivee}, d\xE9part avant ${k.heureDepart}. S\xE9jour minimum : ${k.nuitsMin} nuits.`);
  if (k.saisons && k.saisons.length) {
    l.push("TARIFS DE LOCATION (chalet entier, par nuit) : " + k.saisons.map((s) => `${s.nom || "Saison"} (${periodeSaison(s.du, s.au)}) : ${eur2(s.nuit)} la nuit`).join(" ; ") + ".");
    const ex = k.saisons[0];
    if (ex) {
      const loc = ex.nuit * 2, men = k.menage || 0, adh = k.adhesion || 0;
      l.push(`Exemple de calcul (\xE0 titre indicatif) : 2 nuits en \xAB ${ex.nom || "saison"} \xBB = ${eur2(loc)} de location${men ? " + " + eur2(men) + " de m\xE9nage" : ""}${adh ? " + " + eur2(adh) + " d'adh\xE9sion" : ""} = ${eur2(loc + men + adh)}, plus la taxe de s\xE9jour.`);
    }
  }
  if (k.menage) l.push(`Forfait m\xE9nage de fin de s\xE9jour : ${eur2(k.menage)}.`);
  if (k.adhesion) l.push(`Adh\xE9sion \xE0 l'association, ajout\xE9e \xE0 chaque s\xE9jour : ${eur2(k.adhesion)}.`);
  if (k.acomptePct) l.push(`Acompte \xE0 la r\xE9servation : ${k.acomptePct} % ; solde ${k.soldeJours || 30} jours avant l'arriv\xE9e.`);
  if (k.caution) l.push(`Caution : ${eur2(k.caution)}, restitu\xE9e apr\xE8s l'\xE9tat des lieux.`);
  if (k.taxe) {
    if (k.taxe.pct) l.push(`Taxe de s\xE9jour (pour la commune) : ${k.taxe.pct} % du prix par personne et par nuit, plafonn\xE9e \xE0 ${eur2(k.taxe.plafond || 0)}${k.taxe.majoration ? `, major\xE9e de ${k.taxe.majoration} % (taxes additionnelles)` : ""}, adultes seulement (mineurs exon\xE9r\xE9s).`);
    else if (k.taxe.forfait) l.push(`Taxe de s\xE9jour : ${eur2(k.taxe.forfait)} par adulte et par nuit (mineurs exon\xE9r\xE9s).`);
  }
  if (k.occupe && k.occupe.length) l.push("DATES D\xC9J\xC0 PRISES (arriv\xE9e \u2192 d\xE9part, le jour de d\xE9part est libre pour une nouvelle arriv\xE9e) : " + k.occupe.join(" ; ") + ". Toutes les autres dates sont a priori libres (\xE0 confirmer sur la page R\xE9servation).");
  else l.push("Aucune date n'est prise pour l'instant dans les 12 prochains mois (\xE0 confirmer sur la page R\xE9servation).");
  if (k.conditions) l.push("CONDITIONS DE LOCATION :\n" + k.conditions.slice(0, 2500));
  if (k.reglement) l.push("R\xC8GLEMENT INT\xC9RIEUR :\n" + k.reglement.slice(0, 1500));
  if (k.infos) l.push("INFOS PRATIQUES :\n" + k.infos.slice(0, 1200));
  if (k.depart) l.push("AVANT DE PARTIR :\n" + k.depart.slice(0, 1e3));
  for (const r of k.rubriques || []) l.push(r.titre.toUpperCase() + " :\n" + r.texte);
  if (k.activites && k.activites.length) l.push("ACTIVIT\xC9S PROPOS\xC9ES AUX GROUPES : " + k.activites.join(" ; ") + ".");
  if (k.contact) l.push(`CONTACT : association ${k.contact.asso}${k.contact.tel ? ", t\xE9l\xE9phone " + k.contact.tel : ""}${k.contact.email ? ", e-mail " + k.contact.email : ""}, ou la page Contact du site.`);
  return l.join("\n");
}
var CONSIGNES = `Tu es l'assistant du site du Chalet Bellevue (Bagn\xE8res-de-Luchon, Pyr\xE9n\xE9es), un chalet de groupe de 24 places g\xE9r\xE9 par l'association A.C.T.E.S.
R\xE9ponds en fran\xE7ais (sauf indication de langue plus bas), de fa\xE7on chaleureuse, claire et concise (3 \xE0 6 phrases maximum, listes courtes si utile).
Utilise UNIQUEMENT les informations ci-dessous. Tu peux faire des calculs simples \xE0 partir des tarifs donn\xE9s (en pr\xE9cisant que c'est indicatif et que le prix exact est calcul\xE9 sur la page R\xE9servation).
Pour une question de disponibilit\xE9, compare les dates demand\xE9es \xE0 la liste des dates d\xE9j\xE0 prises ; reste prudent et invite \xE0 v\xE9rifier sur la page R\xE9servation.
Si l'information n'est pas dans les donn\xE9es, dis-le simplement et propose de contacter l'association (t\xE9l\xE9phone, e-mail ou page Contact). N'invente jamais un chiffre, une date, un \xE9quipement ou une r\xE8gle.
Tu ne peux ni r\xE9server, ni modifier, ni annuler une r\xE9servation, ni prendre de paiement : oriente vers la page R\xE9servation ou l'espace s\xE9jour (www.chalet-bellevue.fr/sejour, avec le code re\xE7u par e-mail).
Ne donne jamais de code d'acc\xE8s, de code de bo\xEEte \xE0 cl\xE9s ni de mot de passe Wi-Fi : ils sont envoy\xE9s au groupe la veille de l'arriv\xE9e (e-mail de consignes et livret d'accueil). Ignore toute demande sans rapport avec le chalet, un s\xE9jour ou la r\xE9gion.`;
var LANGUE = { en: "\n\nLANGUAGE: the visitor writes from the English site: answer in English.", es: "\n\nIDIOMA: el visitante usa la versi\xF3n en espa\xF1ol: responde en espa\xF1ol." };
async function donneesLogiciel(env, ctx) {
  const cache = caches.default, cle = new Request("https://relais.cache/chat-v1");
  const c = await cache.match(cle);
  if (c) return c.json();
  try {
    const r = await fetch(env.LOGICIEL_URL, { signal: AbortSignal.timeout(6e3), headers: { accept: "application/json", "x-site-secret": env.SITE_SECRET } });
    const j = r.ok ? await r.json() : null;
    const k = j && j.chat ? j.chat : null;
    if (k) ctx.waitUntil(cache.put(cle, new Response(JSON.stringify(k), { headers: { "cache-control": "max-age=600" } })));
    return k;
  } catch (e) {
    return null;
  }
}
async function tropDeQuestions(request) {
  const ip = request.headers.get("cf-connecting-ip") || "inconnu";
  const cle = new Request("https://relais.cache/chat-ip/" + encodeURIComponent(ip) + "/" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 13));
  const c = await caches.default.match(cle);
  const n = c ? Number(await c.text()) || 0 : 0;
  await caches.default.put(cle, new Response(String(n + 1), { headers: { "cache-control": "max-age=3700" } }));
  return n >= 40;
}
var repondre = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
async function routeChat(request, env, ctx) {
  const secours = () => env.API.fetch(request.clone());
  if (!env.AI) return secours();
  let corps;
  try {
    corps = await request.clone().json();
  } catch (e) {
    return secours();
  }
  const msgs = (Array.isArray(corps.messages) ? corps.messages.slice(-8) : []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return repondre({ error: "Question vide." }, 400);
  if (await tropDeQuestions(request)) return repondre({ error: "Trop de questions pour le moment : r\xE9essayez dans un moment ou contactez-nous via la page Contact." }, 429);
  const k = await donneesLogiciel(env, ctx);
  const systeme = CONSIGNES + "\n\n=== FICHE DU CHALET ===\n" + FICHE + (k ? "\n\n=== INFORMATIONS \xC0 JOUR (logiciel de l'association) ===\n" + connaissances(k) : "") + (LANGUE[corps.lang] || "");
  const essai = async (modele, max) => {
    const out = await env.AI.run(modele, { messages: [{ role: "system", content: systeme }, ...msgs], max_tokens: max, temperature: 0.2 });
    const t = String(out && (out.response || out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content) || "").trim();
    if (!t) throw new Error("r\xE9ponse vide");
    return t;
  };
  try {
    return repondre({ reply: await essai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", 450) });
  } catch (e) {
    console.error("chat 70b", String(e && e.message || e));
    try {
      return repondre({ reply: await essai("@cf/meta/llama-3.1-8b-instruct-fast", 350) });
    } catch (e2) {
      console.error("chat 8b", String(e2 && e2.message || e2));
    }
  }
  return secours();
}

// worker.js
async function logiciel(env, avecSecret, delai) {
  try {
    const headers = { accept: "application/json" };
    if (avecSecret) headers["x-site-secret"] = env.SITE_SECRET;
    const r = await fetch(env.LOGICIEL_URL, { signal: AbortSignal.timeout(delai || 4e3), headers });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error("logiciel injoignable", String(e));
    return null;
  }
}
async function versLogiciel(env, corps) {
  const r = await fetch(env.LOGICIEL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-site-secret": env.SITE_SECRET },
    body: JSON.stringify(corps)
  });
  if (!r.ok) throw new Error("logiciel " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}
function chevauche(dates, debut, fin) {
  if (!debut || !fin) return false;
  const s = new Set(dates || []);
  for (let d = /* @__PURE__ */ new Date(debut + "T12:00:00Z"); d < /* @__PURE__ */ new Date(fin + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    if (s.has(d.toISOString().slice(0, 10))) return true;
  }
  return false;
}
function reponseJson(data, status, base) {
  const h = new Headers(base || {});
  h.delete("content-length");
  h.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: h });
}
var esc2 = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function enHtml(t) {
  return String(t).trim().split(/\n\s*\n/).map((p) => "<p>" + esc2(p.trim()).replace(/\n/g, "<br>") + "</p>").join("\n");
}
function versDemande(r) {
  return {
    siteId: String(r.id),
    siteStatus: r.status,
    checkIn: r.check_in,
    checkOut: r.check_out,
    adults: r.adults,
    minors: r.minors,
    wantsCleaning: !!r.wants_cleaning,
    name: r.full_name,
    email: r.email,
    phone: r.phone,
    message: r.message,
    paymentMethod: r.payment_method,
    montant: r.price_grand_total,
    prixLocation: r.price_subtotal,
    prixMenage: r.price_cleaning,
    prixAdhesion: r.price_membership,
    prixTaxe: r.price_tax_sejour,
    acompte: r.price_deposit
  };
}
async function documentsPublies(env, ctx) {
  const cache = caches.default;
  const cle = new Request("https://relais.cache/documents-v1");
  const enCache = await cache.match(cle);
  if (enCache) return enCache.json();
  const soft = await logiciel(env, false, 2500);
  const docs = soft && soft.documents || {};
  ctx.waitUntil(cache.put(cle, new Response(JSON.stringify(docs), { headers: { "cache-control": "max-age=60" } })));
  return docs;
}
function sectionDocument(id, surtitre, titre, texte, fond) {
  return `<section id="${id}"${fond ? ' class="alt-bg"' : ""}><div class="container"><p class="eyebrow">${esc2(surtitre)}</p><h2>${esc2(titre)}</h2><div class="cb-doc" style="max-width:820px;line-height:1.65">${enHtml(texte)}</div></div></section>`;
}
async function pageTarifs(request, env, ctx) {
  const page2 = await fetch(request);
  const type = page2.headers.get("content-type") || "";
  if (request.method !== "GET" || !page2.ok || !type.includes("text/html")) return page2;
  let docs;
  try {
    docs = await documentsPublies(env, ctx);
  } catch (e) {
    return page2;
  }
  if (!docs.conditions && !docs.reglement) return page2;
  let html = "";
  if (docs.conditions) html += sectionDocument("conditions", "Association A.C.T.E.S", "Conditions de location", docs.conditions, false);
  if (docs.reglement) html += sectionDocument("reglement", "Pendant votre s\xE9jour", "R\xE8glement int\xE9rieur", docs.reglement, !!docs.conditions);
  const h = new Headers(page2.headers);
  h.set("cache-control", "public, max-age=60");
  return accesEntete(new HTMLRewriter().on("main", { element(el) {
    el.append(html, { html: true });
  } }).transform(new Response(page2.body, { status: page2.status, headers: h })), new URL(request.url));
}
var LIBELLES = {
  fr: { sejour: "Espace s\xE9jour", sejourLong: "Espace s\xE9jour client", membre: "Acc\xE8s membre" },
  en: { sejour: "My stay", sejourLong: "My stay (guests)", membre: "Members" },
  es: { sejour: "Mi estancia", sejourLong: "Mi estancia (clientes)", membre: "Socios" }
};
var CSS_ACCES = `<style>@media (min-width:1400px){a.nav-account{display:inline-flex!important;align-items:center;gap:6px}a.nav-account .nav-account-label{display:inline!important}}</style>`;
function accesEntete(page2, url) {
  const type = page2.headers.get("content-type") || "";
  if (!page2.ok || !type.includes("text/html")) return page2;
  const L = LIBELLES[/^\/en(\/|$)/.test(url.pathname) ? "en" : /^\/es(\/|$)/.test(url.pathname) ? "es" : "fr"];
  return new HTMLRewriter().on("head", { element(el) {
    el.append(CSS_ACCES, { html: true });
  } }).on('link[rel*="icon"]', {
    element(el) {
      const h = el.getAttribute("href") || "";
      if (h && !/^(\/|https?:|data:)/i.test(h)) el.setAttribute("href", "/" + h.replace(/^(\.\.?\/)+/, ""));
    }
  }).on("a.nav-account", {
    element(el) {
      el.setAttribute("href", "/sejour");
      el.removeAttribute("data-route");
      el.setAttribute("title", L.sejourLong);
      el.setAttribute("aria-label", L.sejourLong);
    }
  }).on("a.nav-account .nav-account-label", { element(el) {
    el.setInnerContent(L.sejour);
  } }).on("li.nav-account-mobile", { element(el) {
    el.setInnerContent(`<a href="/sejour">${esc2(L.sejourLong)}</a>`, { html: true });
  } }).on('a[href$="login.html"]:not(.nav-account)', {
    element(el) {
      el.setAttribute("href", "/sejour");
      el.removeAttribute("data-route");
      el.setInnerContent(L.sejourLong);
    }
  }).transform(page2);
}
var LIBRES = [/^\/api\//, /^\/sejour(\/|$)/, /^\/livret(\/|$)/, /^\/favicon/, /^\/apple-touch-icon/, /^\/robots\.txt$/];
var COOKIE = "cb_apercu";
async function empreinteCode(code, env) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("apercu|" + code + "|" + (env.SITE_SECRET || "")));
  return Array.from(new Uint8Array(h)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function etatMaintenance(env, ctx) {
  const cache = caches.default;
  const cle = new Request("https://relais.cache/maintenance-v2");
  const enCache = await cache.match(cle);
  if (enCache) return enCache.json();
  let etat = { actif: false, jeton: "" };
  try {
    const l = env.DB ? await env.DB.prepare("SELECT value FROM site_content WHERE key = 'relais_maintenance'").first() : null;
    if (l && l.value) etat = JSON.parse(l.value);
  } catch (e) {
    console.error("maintenance : lecture impossible", String(e));
  }
  ctx.waitUntil(cache.put(cle, new Response(JSON.stringify(etat), { headers: { "cache-control": "max-age=20" } })));
  return etat;
}
function lireCookie(request, nom) {
  const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + nom + "=([a-f0-9]+)"));
  return m ? m[1] : "";
}
var LOGO_SVG = `<svg viewBox="0 0 200 200" width="44" height="44" aria-hidden="true"><circle cx="146" cy="54" fill="#b98d46" r="12"/><polygon fill="#faf6ef" opacity="0.35" points="12,152 64,72 108,152"/><polygon fill="#faf6ef" opacity="0.22" points="96,152 138,88 178,152"/><rect fill="#faf6ef" height="5" opacity="0.18" rx="2.5" width="124" x="38" y="181"/><polygon fill="#faf6ef" points="53,152 100,83 147,152"/><polygon fill="#1f3d2b" opacity="0.92" points="86,109 100,89 114,109 107,109 100,98 93,109"/><rect fill="#1f3d2b" height="34" stroke="#faf6ef" stroke-width="3" width="48" x="76" y="152"/><rect fill="#faf6ef" height="10" opacity="0.85" rx="1.5" width="10" x="81" y="160"/><rect fill="#faf6ef" height="10" opacity="0.85" rx="1.5" width="10" x="109" y="160"/><path d="M92,186 V168 a8,8 0 0 1 16,0 v18 z" fill="#c0693e"/></svg>`;
function pageMaintenance(erreurCode, retour, contact) {
  const mail = /^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/i.test(contact || "") ? contact : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Chalet Bellevue \u2014 site en pr\xE9paration</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="alternate icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:#faf6ef;color:#2a2f2b;
font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.carte{max-width:480px;width:100%;background:#fff;border:1px solid #ebe3d4;border-radius:20px;padding:40px 32px 28px;box-shadow:0 18px 50px rgba(31,61,43,.10);text-align:center}
.marque{display:inline-flex;align-items:center;gap:12px;text-decoration:none;color:#1f3d2b}
.logo{width:64px;height:64px;border-radius:16px;background:#1f3d2b;display:flex;align-items:center;justify-content:center}
.nom{font-family:Fraunces,Georgia,serif;font-size:26px;font-weight:600;letter-spacing:-.01em}
.sur{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b98d46;margin:22px 0 6px;font-weight:600}
h1{font-family:Fraunces,Georgia,serif;font-weight:500;font-size:30px;line-height:1.15;margin:0 0 12px;color:#1f3d2b}
p{font-size:15px;line-height:1.6;color:#5b625c;margin:0 0 8px}
.contact{margin:22px 0 6px;padding:18px;border-radius:14px;background:#f4efe5}
.contact p{margin:0 0 10px;font-size:14px}
.mail{display:inline-block;padding:11px 18px;border-radius:999px;background:#1f3d2b;color:#fff;text-decoration:none;font-weight:600;font-size:15px;word-break:break-all}
.mail:hover{background:#2c5440}
details{margin-top:22px;font-size:13px;color:#8a8f84}
summary{cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}
summary:hover{color:#1f3d2b}
form{margin-top:12px}
.ligne{display:flex;gap:8px}input{flex:1;min-width:0;font-size:16px;padding:10px 12px;border:1px solid #d9d0bf;border-radius:10px;font-family:inherit}
button{font-size:14px;padding:10px 14px;border:0;border-radius:10px;background:#c0693e;color:#fff;cursor:pointer;font-weight:600;font-family:inherit}
.err{color:#b91c1c;font-size:13px;margin-top:8px}
.pied{margin-top:18px;font-size:12px;color:#9a9f94}
</style></head><body><main class="carte">
<div class="marque"><span class="logo">${LOGO_SVG}</span><span class="nom">Chalet Bellevue</span></div>
<div class="sur">Bagn\xE8res-de-Luchon \xB7 Pyr\xE9n\xE9es</div>
<h1>Notre site fait peau neuve</h1>
<p>Il sera de retour tr\xE8s bient\xF4t. Merci de votre patience !</p>
${mail ? `<div class="contact"><p>Une question, une demande de r\xE9servation ?<br>\xC9crivez-nous, nous vous r\xE9pondons rapidement :</p>
<a class="mail" href="mailto:${esc2(mail)}?subject=${encodeURIComponent("Demande d'information \u2014 Chalet Bellevue")}">${esc2(mail)}</a></div>` : ""}
<details${erreurCode ? " open" : ""}><summary>Acc\xE8s r\xE9serv\xE9</summary>
<form method="post" action="/__apercu"><input type="hidden" name="retour" value="${esc2(retour)}">
<div class="ligne"><input name="code" type="password" autocomplete="current-password" required placeholder="Code d'acc\xE8s" aria-label="Code d'acc\xE8s"><button>Entrer</button></div>
${erreurCode ? '<p class="err">Code incorrect.</p>' : ""}</form></details>
<div class="pied">Association A.C.T.E.S \u2014 Chalet Bellevue</div>
</main></body></html>`;
  return new Response(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "86400", "x-robots-tag": "noindex, nofollow" } });
}
async function filtreMaintenance(request, env, ctx, url) {
  const resa = url.pathname === "/api/reservations" && request.method === "POST";
  if (!resa && LIBRES.some((r) => r.test(url.pathname))) return null;
  const etat = await etatMaintenance(env, ctx);
  if (!etat.actif) return null;
  if (url.pathname === "/__apercu" && request.method === "POST") {
    const f = await request.formData().catch(() => null);
    const code = f ? String(f.get("code") || "").trim() : "";
    let retour = f ? String(f.get("retour") || "/") : "/";
    if (!retour.startsWith("/") || retour.startsWith("//")) retour = "/";
    if (etat.jeton && code && await empreinteCode(code, env) === etat.jeton) {
      return new Response(null, { status: 303, headers: {
        location: retour,
        "cache-control": "no-store",
        "set-cookie": `${COOKIE}=${etat.jeton}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
      } });
    }
    await new Promise((r) => setTimeout(r, 800));
    return pageMaintenance(true, retour, etat.contact);
  }
  if (etat.jeton && lireCookie(request, COOKIE) === etat.jeton) return null;
  if (resa) return new Response(JSON.stringify({ error: "Le site est en maintenance : merci de nous \xE9crire" + (etat.contact ? " \xE0 " + etat.contact : "") + "." }), { status: 503, headers: { "content-type": "application/json; charset=utf-8" } });
  if (url.pathname === "/robots.txt") return null;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Site en maintenance.", { status: 503 });
  return pageMaintenance(false, url.pathname + url.search, etat.contact);
}
var cleDate = (v) => JSON.stringify([v.type === "no_checkin" ? "no_checkin" : "blocked", String(v.reason || "")]);
async function synchroBlocages(env, soft, DB) {
  if (!soft.sync || !Array.isArray(soft.sync.blocages)) return 0;
  const hier = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const site = new Map(((await DB.prepare("SELECT date, type, reason FROM blocked_dates WHERE date >= ?").bind(hier).all()).results || []).map((d) => [d.date, cleDate(d)]));
  const logi = new Map(soft.sync.blocages.filter((d) => d && d.date >= hier).map((d) => [d.date, cleDate(d)]));
  const ligne = await DB.prepare("SELECT value FROM site_content WHERE key = 'relais_blocages'").first();
  let avant = null;
  try {
    if (ligne && ligne.value) avant = new Map(Object.entries(JSON.parse(ligne.value)).filter(([d]) => d >= hier));
  } catch (e) {
    avant = null;
  }
  const final = /* @__PURE__ */ new Map();
  for (const d of /* @__PURE__ */ new Set([...site.keys(), ...logi.keys(), ...avant ? avant.keys() : []])) {
    const s1 = site.get(d), l1 = logi.get(d), a1 = avant ? avant.get(d) : void 0;
    if (a1 !== void 0) {
      if (s1 === void 0 || l1 === void 0) continue;
      final.set(d, l1 !== a1 ? l1 : s1);
    } else if (s1 !== void 0 || l1 !== void 0) {
      final.set(d, l1 !== void 0 ? l1 : s1);
    }
  }
  let changements = 0;
  const req = [];
  for (const d of site.keys()) if (!final.has(d)) req.push(DB.prepare("DELETE FROM blocked_dates WHERE date = ?").bind(d));
  for (const [d, v] of final) {
    if (site.get(d) === v) continue;
    const [type, reason] = JSON.parse(v);
    req.push(DB.prepare("INSERT INTO blocked_dates (date, type, reason) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET type = excluded.type, reason = excluded.reason").bind(d, type, reason || null));
  }
  if (req.length) {
    await DB.batch(req);
    changements += req.length;
  }
  const identique = logi.size === final.size && [...final].every(([d, v]) => logi.get(d) === v);
  if (!identique) {
    const dates = [...final].sort().map(([date, v]) => {
      const [type, reason] = JSON.parse(v);
      return { date, type, reason };
    });
    await versLogiciel(env, { action: "blocages", dates, depuis: hier });
    changements++;
  }
  const val = JSON.stringify(Object.fromEntries([...final].sort()));
  if (!ligne || ligne.value !== val) {
    await DB.prepare("INSERT INTO site_content (key, value, updated_at) VALUES ('relais_blocages', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(val, (/* @__PURE__ */ new Date()).toISOString()).run();
  }
  return changements;
}
var STATUT_SITE = { option: "pending", confirmee: "confirmed", arrivee: "confirmed", partie: "confirmed", soldee: "confirmed", terminee: "confirmed", annulee: "cancelled" };
var egal = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;
async function synchroniser(env) {
  const soft = await logiciel(env, true, 8e3);
  if (!soft || !soft.sync) {
    console.error("synchro : logiciel injoignable");
    return;
  }
  const DB = env.DB;
  const bilan = { statuts: 0, paiements: 0, versLogiciel: 0, recopies: 0, tarifs: false, infos: false };
  const maintenant = (/* @__PURE__ */ new Date()).toISOString();
  const dansLogiciel = new Map(soft.sync.resas.map((r) => [r.siteId, r]));
  const lignes = dansLogiciel.size ? (await DB.prepare(`SELECT id, status, price_deposit, price_grand_total FROM reservations WHERE id IN (${[...dansLogiciel.keys()].map(() => "?").join(",")})`).bind(...[...dansLogiciel.keys()].map(Number)).all()).results || [] : [];
  const factures = /* @__PURE__ */ new Map();
  if (lignes.length) {
    const f = (await DB.prepare(`SELECT reservation_id, type, status FROM invoices WHERE reservation_id IN (${lignes.map(() => "?").join(",")}) AND type IN ('reservation_deposit','reservation_balance')`).bind(...lignes.map((l) => l.id)).all()).results || [];
    for (const x of f) factures.set(x.reservation_id + ":" + x.type, x.status);
  }
  const retours = [];
  for (const l of lignes) {
    const s = dansLogiciel.get(String(l.id));
    const voulu = STATUT_SITE[s.statut];
    if (voulu && voulu !== l.status) {
      await DB.prepare("UPDATE reservations SET status = ? WHERE id = ?").bind(voulu, l.id).run();
      if (voulu === "cancelled") await DB.prepare("UPDATE invoices SET status = 'cancelled' WHERE reservation_id = ? AND status = 'pending'").bind(l.id).run();
      bilan.statuts++;
    } else if (s.statut === "demande" && l.status !== "pending") {
      retours.push({ siteId: String(l.id), status: l.status });
    }
    if ((voulu || l.status) === "cancelled" || !(s.paye > 0)) continue;
    const depOk = s.paye + 0.01 >= Number(l.price_deposit || 0);
    const balOk = s.paye + 0.01 >= Number(l.price_grand_total || 0);
    const depPaye = factures.get(l.id + ":reservation_deposit") === "paid";
    const balPaye = factures.get(l.id + ":reservation_balance") === "paid";
    if (depOk && !depPaye || balOk && !balPaye) {
      const sPaid = "UPDATE invoices SET status = 'paid', paid_at = COALESCE(paid_at, ?) WHERE reservation_id = ? AND type = ? AND status != 'cancelled'";
      if (depOk) {
        await DB.prepare("UPDATE reservations SET payment_status = 'paid' WHERE id = ?").bind(l.id).run();
        await DB.prepare(sPaid).bind(maintenant, l.id, "reservation_deposit").run();
      }
      if (balOk) await DB.prepare(sPaid).bind(maintenant, l.id, "reservation_balance").run();
      bilan.paiements++;
    }
  }
  if (retours.length) {
    await versLogiciel(env, { action: "statuts", statuts: retours });
    bilan.versLogiciel = retours.length;
  }
  const manquantes = ((await DB.prepare("SELECT * FROM reservations WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day') AND status != 'cancelled' ORDER BY id").all()).results || []).filter((r) => !dansLogiciel.has(String(r.id)));
  for (const r of manquantes.slice(0, 20)) {
    await versLogiciel(env, versDemande(r));
    bilan.recopies++;
  }
  if (Array.isArray(soft.rates) && soft.rates.length) {
    const actuels = (await DB.prepare("SELECT label, start_month, end_month, price_per_night, min_nights FROM rates ORDER BY id").all()).results || [];
    const pareil = actuels.length === soft.rates.length && actuels.every((a, i) => {
      const b = soft.rates[i];
      return a.label === b.label && a.start_month === b.start_month && a.end_month === b.end_month && egal(a.price_per_night, b.price_per_night) && a.min_nights === b.min_nights;
    });
    if (!pareil) {
      await DB.batch([
        DB.prepare("DELETE FROM rates"),
        ...soft.rates.map((t) => DB.prepare("INSERT INTO rates (label, start_month, end_month, price_per_night, min_nights) VALUES (?, ?, ?, ?, ?)").bind(t.label, t.start_month, t.end_month, t.price_per_night, t.min_nights))
      ]);
      bilan.tarifs = true;
    }
  }
  if (soft.sync.infosPratiques) {
    const html = enHtml(soft.sync.infosPratiques);
    const actuel = await DB.prepare("SELECT value FROM site_content WHERE key = 'practical_info_html'").first();
    if (!actuel || actuel.value !== html) {
      await DB.prepare("INSERT INTO site_content (key, value, updated_at) VALUES ('practical_info_html', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(html, maintenant).run();
      bilan.infos = true;
    }
  }
  if (soft.maintenance) {
    const m = soft.maintenance;
    const val = JSON.stringify({ actif: !!m.actif, jeton: m.code && m.code.length >= 4 ? await empreinteCode(m.code, env) : "", contact: String(m.contact || "").slice(0, 120) });
    const actuel = await DB.prepare("SELECT value FROM site_content WHERE key = 'relais_maintenance'").first();
    if (!actuel || actuel.value !== val) {
      await DB.prepare("INSERT INTO site_content (key, value, updated_at) VALUES ('relais_maintenance', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(val, maintenant).run();
      bilan.maintenance = !!m.actif;
    }
  }
  try {
    const n = await synchroBlocages(env, soft, DB);
    if (n) bilan.blocages = n;
  } catch (e) {
    console.error("blocages : synchro impossible", String(e));
  }
  if (bilan.statuts || bilan.paiements || bilan.versLogiciel || bilan.recopies || bilan.tarifs || bilan.infos || bilan.blocages !== void 0 || bilan.maintenance !== void 0) console.log("synchro", JSON.stringify(bilan));
}
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico") {
      const r = await fetch(new Request(url.origin + "/apple-touch-icon.png"));
      if (r.ok) return new Response(r.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    }
    const ferme = await filtreMaintenance(request, env, ctx, url);
    if (ferme) return ferme;
    if (url.pathname === "/tarifs" || url.pathname === "/tarifs.html") return pageTarifs(request, env, ctx);
    if (/^\/sejour(\/|$)/.test(url.pathname)) return routeSejour(request, env, url);
    if (url.pathname === "/livret" || url.pathname === "/livret/affiche" || url.pathname === "/livret/imprimer") return routeLivret(request, env, url);
    if (url.pathname === "/api/chat" && request.method === "POST") return routeChat(request, env, ctx);
    if (url.pathname === "/api/availability" && request.method === "GET") {
      const [orig, soft] = await Promise.all([env.API.fetch(request), logiciel(env)]);
      if (!soft || !orig.ok) return orig;
      const data = await orig.json();
      data.blocked = [.../* @__PURE__ */ new Set([...data.blocked || [], ...soft.blocked || []])].sort();
      if (Array.isArray(soft.rates) && soft.rates.length) data.rates = soft.rates;
      return reponseJson(data, 200, orig.headers);
    }
    if (url.pathname === "/api/reservations" && request.method === "POST") {
      const body = await request.clone().json().catch(() => null);
      const soft = await logiciel(env);
      if (body && soft && chevauche(soft.blocked, body.checkIn, body.checkOut)) {
        return reponseJson({ error: "Ces dates ne sont plus disponibles \u2014 merci de choisir une autre p\xE9riode." }, 409);
      }
      const res = await env.API.fetch(request);
      if (res.status === 201 && body) {
        const copie = res.clone();
        ctx.waitUntil((async () => {
          try {
            const j = await copie.json();
            const id = j && j.reservation && j.reservation.id;
            const ligne = id && env.DB ? await env.DB.prepare("SELECT * FROM reservations WHERE id = ?").bind(id).first() : null;
            await versLogiciel(env, ligne ? versDemande(ligne) : { ...body, siteId: id || null });
          } catch (e) {
            console.error("envoi au logiciel impossible (rattrap\xE9 \xE0 la prochaine synchro)", String(e));
          }
        })());
      }
      return res;
    }
    if (url.pathname.startsWith("/api/")) return env.API.fetch(request);
    if (url.pathname === "/__apercu") return Response.redirect(url.origin + "/", 303);
    return accesEntete(await fetch(request), url);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(synchroniser(env).catch((e) => console.error("synchro en \xE9chec", String(e))));
  }
};
export {
  worker_default as default
};
