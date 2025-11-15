(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(global = global || self, factory(global.TracespaceParser = {}));
}(this, (function (exports) { 'use strict';

	// common constants
	// filetype constants
	var GERBER = 'gerber';
	var DRILL = 'drill'; // units constants

	var MM = 'mm';
	var IN = 'in'; // format constants

	var LEADING = 'leading';
	var TRAILING = 'trailing';
	var ABSOLUTE = 'absolute';
	var INCREMENTAL = 'incremental'; // tool constants

	var CIRCLE = 'circle';
	var RECTANGLE = 'rectangle';
	var OBROUND = 'obround';
	var POLYGON = 'polygon';
	var MACRO_SHAPE = 'macroShape'; // macro primitive codes

	var MACRO_CIRCLE = '1';
	var MACRO_VECTOR_LINE = '20';
	var MACRO_CENTER_LINE = '21';
	var MACRO_OUTLINE = '4';
	var MACRO_POLYGON = '5';
	var MACRO_MOIRE = '6';
	var MACRO_THERMAL = '7'; // drawing constants

	var SHAPE = 'shape';
	var MOVE = 'move';
	var SEGMENT = 'segment';
	var SLOT = 'slot'; // interpolation / routing constants

	var LINE = 'line';
	var CW_ARC = 'cwArc';
	var CCW_ARC = 'ccwArc'; // quadrant mode

	var SINGLE = 'single';
	var MULTI = 'multi'; // load polarity

	var DARK = 'dark';
	var CLEAR = 'clear';

	var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	function createCommonjsModule(fn, basedir, module) {
		return module = {
		  path: basedir,
		  exports: {},
		  require: function (path, base) {
	      return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
	    }
		}, fn(module, module.exports), module.exports;
	}

	function commonjsRequire () {
		throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
	}

	var moo = createCommonjsModule(function (module) {
	(function(root, factory) {
	  if ( module.exports) {
	    module.exports = factory();
	  } else {
	    root.moo = factory();
	  }
	}(commonjsGlobal, function() {

	  var hasOwnProperty = Object.prototype.hasOwnProperty;
	  var toString = Object.prototype.toString;
	  var hasSticky = typeof new RegExp().sticky === 'boolean';

	  /***************************************************************************/

	  function isRegExp(o) { return o && toString.call(o) === '[object RegExp]' }
	  function isObject(o) { return o && typeof o === 'object' && !isRegExp(o) && !Array.isArray(o) }

	  function reEscape(s) {
	    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
	  }
	  function reGroups(s) {
	    var re = new RegExp('|' + s);
	    return re.exec('').length - 1
	  }
	  function reCapture(s) {
	    return '(' + s + ')'
	  }
	  function reUnion(regexps) {
	    if (!regexps.length) return '(?!)'
	    var source =  regexps.map(function(s) {
	      return "(?:" + s + ")"
	    }).join('|');
	    return "(?:" + source + ")"
	  }

	  function regexpOrLiteral(obj) {
	    if (typeof obj === 'string') {
	      return '(?:' + reEscape(obj) + ')'

	    } else if (isRegExp(obj)) {
	      // TODO: consider /u support
	      if (obj.ignoreCase) throw new Error('RegExp /i flag not allowed')
	      if (obj.global) throw new Error('RegExp /g flag is implied')
	      if (obj.sticky) throw new Error('RegExp /y flag is implied')
	      if (obj.multiline) throw new Error('RegExp /m flag is implied')
	      return obj.source

	    } else {
	      throw new Error('Not a pattern: ' + obj)
	    }
	  }

	  function objectToRules(object) {
	    var keys = Object.getOwnPropertyNames(object);
	    var result = [];
	    for (var i = 0; i < keys.length; i++) {
	      var key = keys[i];
	      var thing = object[key];
	      var rules = [].concat(thing);
	      if (key === 'include') {
	        for (var j = 0; j < rules.length; j++) {
	          result.push({include: rules[j]});
	        }
	        continue
	      }
	      var match = [];
	      rules.forEach(function(rule) {
	        if (isObject(rule)) {
	          if (match.length) result.push(ruleOptions(key, match));
	          result.push(ruleOptions(key, rule));
	          match = [];
	        } else {
	          match.push(rule);
	        }
	      });
	      if (match.length) result.push(ruleOptions(key, match));
	    }
	    return result
	  }

	  function arrayToRules(array) {
	    var result = [];
	    for (var i = 0; i < array.length; i++) {
	      var obj = array[i];
	      if (obj.include) {
	        var include = [].concat(obj.include);
	        for (var j = 0; j < include.length; j++) {
	          result.push({include: include[j]});
	        }
	        continue
	      }
	      if (!obj.type) {
	        throw new Error('Rule has no type: ' + JSON.stringify(obj))
	      }
	      result.push(ruleOptions(obj.type, obj));
	    }
	    return result
	  }

	  function ruleOptions(type, obj) {
	    if (!isObject(obj)) {
	      obj = { match: obj };
	    }
	    if (obj.include) {
	      throw new Error('Matching rules cannot also include states')
	    }

	    // nb. error and fallback imply lineBreaks
	    var options = {
	      defaultType: type,
	      lineBreaks: !!obj.error || !!obj.fallback,
	      pop: false,
	      next: null,
	      push: null,
	      error: false,
	      fallback: false,
	      value: null,
	      type: null,
	      shouldThrow: false,
	    };

	    // Avoid Object.assign(), so we support IE9+
	    for (var key in obj) {
	      if (hasOwnProperty.call(obj, key)) {
	        options[key] = obj[key];
	      }
	    }

	    // type transform cannot be a string
	    if (typeof options.type === 'string' && type !== options.type) {
	      throw new Error("Type transform cannot be a string (type '" + options.type + "' for token '" + type + "')")
	    }

	    // convert to array
	    var match = options.match;
	    options.match = Array.isArray(match) ? match : match ? [match] : [];
	    options.match.sort(function(a, b) {
	      return isRegExp(a) && isRegExp(b) ? 0
	           : isRegExp(b) ? -1 : isRegExp(a) ? +1 : b.length - a.length
	    });
	    return options
	  }

	  function toRules(spec) {
	    return Array.isArray(spec) ? arrayToRules(spec) : objectToRules(spec)
	  }

	  var defaultErrorRule = ruleOptions('error', {lineBreaks: true, shouldThrow: true});
	  function compileRules(rules, hasStates) {
	    var errorRule = null;
	    var fast = Object.create(null);
	    var fastAllowed = true;
	    var unicodeFlag = null;
	    var groups = [];
	    var parts = [];

	    // If there is a fallback rule, then disable fast matching
	    for (var i = 0; i < rules.length; i++) {
	      if (rules[i].fallback) {
	        fastAllowed = false;
	      }
	    }

	    for (var i = 0; i < rules.length; i++) {
	      var options = rules[i];

	      if (options.include) {
	        // all valid inclusions are removed by states() preprocessor
	        throw new Error('Inheritance is not allowed in stateless lexers')
	      }

	      if (options.error || options.fallback) {
	        // errorRule can only be set once
	        if (errorRule) {
	          if (!options.fallback === !errorRule.fallback) {
	            throw new Error("Multiple " + (options.fallback ? "fallback" : "error") + " rules not allowed (for token '" + options.defaultType + "')")
	          } else {
	            throw new Error("fallback and error are mutually exclusive (for token '" + options.defaultType + "')")
	          }
	        }
	        errorRule = options;
	      }

	      var match = options.match.slice();
	      if (fastAllowed) {
	        while (match.length && typeof match[0] === 'string' && match[0].length === 1) {
	          var word = match.shift();
	          fast[word.charCodeAt(0)] = options;
	        }
	      }

	      // Warn about inappropriate state-switching options
	      if (options.pop || options.push || options.next) {
	        if (!hasStates) {
	          throw new Error("State-switching options are not allowed in stateless lexers (for token '" + options.defaultType + "')")
	        }
	        if (options.fallback) {
	          throw new Error("State-switching options are not allowed on fallback tokens (for token '" + options.defaultType + "')")
	        }
	      }

	      // Only rules with a .match are included in the RegExp
	      if (match.length === 0) {
	        continue
	      }
	      fastAllowed = false;

	      groups.push(options);

	      // Check unicode flag is used everywhere or nowhere
	      for (var j = 0; j < match.length; j++) {
	        var obj = match[j];
	        if (!isRegExp(obj)) {
	          continue
	        }

	        if (unicodeFlag === null) {
	          unicodeFlag = obj.unicode;
	        } else if (unicodeFlag !== obj.unicode && options.fallback === false) {
	          throw new Error('If one rule is /u then all must be')
	        }
	      }

	      // convert to RegExp
	      var pat = reUnion(match.map(regexpOrLiteral));

	      // validate
	      var regexp = new RegExp(pat);
	      if (regexp.test("")) {
	        throw new Error("RegExp matches empty string: " + regexp)
	      }
	      var groupCount = reGroups(pat);
	      if (groupCount > 0) {
	        throw new Error("RegExp has capture groups: " + regexp + "\nUse (?: … ) instead")
	      }

	      // try and detect rules matching newlines
	      if (!options.lineBreaks && regexp.test('\n')) {
	        throw new Error('Rule should declare lineBreaks: ' + regexp)
	      }

	      // store regex
	      parts.push(reCapture(pat));
	    }


	    // If there's no fallback rule, use the sticky flag so we only look for
	    // matches at the current index.
	    //
	    // If we don't support the sticky flag, then fake it using an irrefutable
	    // match (i.e. an empty pattern).
	    var fallbackRule = errorRule && errorRule.fallback;
	    var flags = hasSticky && !fallbackRule ? 'ym' : 'gm';
	    var suffix = hasSticky || fallbackRule ? '' : '|';

	    if (unicodeFlag === true) flags += "u";
	    var combined = new RegExp(reUnion(parts) + suffix, flags);
	    return {regexp: combined, groups: groups, fast: fast, error: errorRule || defaultErrorRule}
	  }

	  function compile(rules) {
	    var result = compileRules(toRules(rules));
	    return new Lexer({start: result}, 'start')
	  }

	  function checkStateGroup(g, name, map) {
	    var state = g && (g.push || g.next);
	    if (state && !map[state]) {
	      throw new Error("Missing state '" + state + "' (in token '" + g.defaultType + "' of state '" + name + "')")
	    }
	    if (g && g.pop && +g.pop !== 1) {
	      throw new Error("pop must be 1 (in token '" + g.defaultType + "' of state '" + name + "')")
	    }
	  }
	  function compileStates(states, start) {
	    var all = states.$all ? toRules(states.$all) : [];
	    delete states.$all;

	    var keys = Object.getOwnPropertyNames(states);
	    if (!start) start = keys[0];

	    var ruleMap = Object.create(null);
	    for (var i = 0; i < keys.length; i++) {
	      var key = keys[i];
	      ruleMap[key] = toRules(states[key]).concat(all);
	    }
	    for (var i = 0; i < keys.length; i++) {
	      var key = keys[i];
	      var rules = ruleMap[key];
	      var included = Object.create(null);
	      for (var j = 0; j < rules.length; j++) {
	        var rule = rules[j];
	        if (!rule.include) continue
	        var splice = [j, 1];
	        if (rule.include !== key && !included[rule.include]) {
	          included[rule.include] = true;
	          var newRules = ruleMap[rule.include];
	          if (!newRules) {
	            throw new Error("Cannot include nonexistent state '" + rule.include + "' (in state '" + key + "')")
	          }
	          for (var k = 0; k < newRules.length; k++) {
	            var newRule = newRules[k];
	            if (rules.indexOf(newRule) !== -1) continue
	            splice.push(newRule);
	          }
	        }
	        rules.splice.apply(rules, splice);
	        j--;
	      }
	    }

	    var map = Object.create(null);
	    for (var i = 0; i < keys.length; i++) {
	      var key = keys[i];
	      map[key] = compileRules(ruleMap[key], true);
	    }

	    for (var i = 0; i < keys.length; i++) {
	      var name = keys[i];
	      var state = map[name];
	      var groups = state.groups;
	      for (var j = 0; j < groups.length; j++) {
	        checkStateGroup(groups[j], name, map);
	      }
	      var fastKeys = Object.getOwnPropertyNames(state.fast);
	      for (var j = 0; j < fastKeys.length; j++) {
	        checkStateGroup(state.fast[fastKeys[j]], name, map);
	      }
	    }

	    return new Lexer(map, start)
	  }

	  function keywordTransform(map) {
	    var reverseMap = Object.create(null);
	    var byLength = Object.create(null);
	    var types = Object.getOwnPropertyNames(map);
	    for (var i = 0; i < types.length; i++) {
	      var tokenType = types[i];
	      var item = map[tokenType];
	      var keywordList = Array.isArray(item) ? item : [item];
	      keywordList.forEach(function(keyword) {
	        (byLength[keyword.length] = byLength[keyword.length] || []).push(keyword);
	        if (typeof keyword !== 'string') {
	          throw new Error("keyword must be string (in keyword '" + tokenType + "')")
	        }
	        reverseMap[keyword] = tokenType;
	      });
	    }

	    // fast string lookup
	    // https://jsperf.com/string-lookups
	    function str(x) { return JSON.stringify(x) }
	    var source = '';
	    source += 'switch (value.length) {\n';
	    for (var length in byLength) {
	      var keywords = byLength[length];
	      source += 'case ' + length + ':\n';
	      source += 'switch (value) {\n';
	      keywords.forEach(function(keyword) {
	        var tokenType = reverseMap[keyword];
	        source += 'case ' + str(keyword) + ': return ' + str(tokenType) + '\n';
	      });
	      source += '}\n';
	    }
	    source += '}\n';
	    return Function('value', source) // type
	  }

	  /***************************************************************************/

	  var Lexer = function(states, state) {
	    this.startState = state;
	    this.states = states;
	    this.buffer = '';
	    this.stack = [];
	    this.reset();
	  };

	  Lexer.prototype.reset = function(data, info) {
	    this.buffer = data || '';
	    this.index = 0;
	    this.line = info ? info.line : 1;
	    this.col = info ? info.col : 1;
	    this.queuedToken = info ? info.queuedToken : null;
	    this.queuedThrow = info ? info.queuedThrow : null;
	    this.setState(info ? info.state : this.startState);
	    this.stack = info && info.stack ? info.stack.slice() : [];
	    return this
	  };

	  Lexer.prototype.save = function() {
	    return {
	      line: this.line,
	      col: this.col,
	      state: this.state,
	      stack: this.stack.slice(),
	      queuedToken: this.queuedToken,
	      queuedThrow: this.queuedThrow,
	    }
	  };

	  Lexer.prototype.setState = function(state) {
	    if (!state || this.state === state) return
	    this.state = state;
	    var info = this.states[state];
	    this.groups = info.groups;
	    this.error = info.error;
	    this.re = info.regexp;
	    this.fast = info.fast;
	  };

	  Lexer.prototype.popState = function() {
	    this.setState(this.stack.pop());
	  };

	  Lexer.prototype.pushState = function(state) {
	    this.stack.push(this.state);
	    this.setState(state);
	  };

	  var eat = hasSticky ? function(re, buffer) { // assume re is /y
	    return re.exec(buffer)
	  } : function(re, buffer) { // assume re is /g
	    var match = re.exec(buffer);
	    // will always match, since we used the |(?:) trick
	    if (match[0].length === 0) {
	      return null
	    }
	    return match
	  };

	  Lexer.prototype._getGroup = function(match) {
	    var groupCount = this.groups.length;
	    for (var i = 0; i < groupCount; i++) {
	      if (match[i + 1] !== undefined) {
	        return this.groups[i]
	      }
	    }
	    throw new Error('Cannot find token type for matched text')
	  };

	  function tokenToString() {
	    return this.value
	  }

	  Lexer.prototype.next = function() {
	    var index = this.index;

	    // If a fallback token matched, we don't need to re-run the RegExp
	    if (this.queuedGroup) {
	      var token = this._token(this.queuedGroup, this.queuedText, index);
	      this.queuedGroup = null;
	      this.queuedText = "";
	      return token
	    }

	    var buffer = this.buffer;
	    if (index === buffer.length) {
	      return // EOF
	    }

	    // Fast matching for single characters
	    var group = this.fast[buffer.charCodeAt(index)];
	    if (group) {
	      return this._token(group, buffer.charAt(index), index)
	    }

	    // Execute RegExp
	    var re = this.re;
	    re.lastIndex = index;
	    var match = eat(re, buffer);

	    // Error tokens match the remaining buffer
	    var error = this.error;
	    if (match == null) {
	      return this._token(error, buffer.slice(index, buffer.length), index)
	    }

	    var group = this._getGroup(match);
	    var text = match[0];

	    if (error.fallback && match.index !== index) {
	      this.queuedGroup = group;
	      this.queuedText = text;

	      // Fallback tokens contain the unmatched portion of the buffer
	      return this._token(error, buffer.slice(index, match.index), index)
	    }

	    return this._token(group, text, index)
	  };

	  Lexer.prototype._token = function(group, text, offset) {
	    // count line breaks
	    var lineBreaks = 0;
	    if (group.lineBreaks) {
	      var matchNL = /\n/g;
	      var nl = 1;
	      if (text === '\n') {
	        lineBreaks = 1;
	      } else {
	        while (matchNL.exec(text)) { lineBreaks++; nl = matchNL.lastIndex; }
	      }
	    }

	    var token = {
	      type: (typeof group.type === 'function' && group.type(text)) || group.defaultType,
	      value: typeof group.value === 'function' ? group.value(text) : text,
	      text: text,
	      toString: tokenToString,
	      offset: offset,
	      lineBreaks: lineBreaks,
	      line: this.line,
	      col: this.col,
	    };
	    // nb. adding more props to token object will make V8 sad!

	    var size = text.length;
	    this.index += size;
	    this.line += lineBreaks;
	    if (lineBreaks !== 0) {
	      this.col = size - nl + 1;
	    } else {
	      this.col += size;
	    }

	    // throw, if no rule with {error: true}
	    if (group.shouldThrow) {
	      throw new Error(this.formatError(token, "invalid syntax"))
	    }

	    if (group.pop) this.popState();
	    else if (group.push) this.pushState(group.push);
	    else if (group.next) this.setState(group.next);

	    return token
	  };

	  if (typeof Symbol !== 'undefined' && Symbol.iterator) {
	    var LexerIterator = function(lexer) {
	      this.lexer = lexer;
	    };

	    LexerIterator.prototype.next = function() {
	      var token = this.lexer.next();
	      return {value: token, done: !token}
	    };

	    LexerIterator.prototype[Symbol.iterator] = function() {
	      return this
	    };

	    Lexer.prototype[Symbol.iterator] = function() {
	      return new LexerIterator(this)
	    };
	  }

	  Lexer.prototype.formatError = function(token, message) {
	    if (token == null) {
	      // An undefined token indicates EOF
	      var text = this.buffer.slice(this.index);
	      var token = {
	        text: text,
	        offset: this.index,
	        lineBreaks: text.indexOf('\n') === -1 ? 0 : 1,
	        line: this.line,
	        col: this.col,
	      };
	    }
	    var start = Math.max(0, token.offset - token.col + 1);
	    var eol = token.lineBreaks ? token.text.indexOf('\n') : token.text.length;
	    var firstLine = this.buffer.substring(start, token.offset + eol);
	    message += " at line " + token.line + " col " + token.col + ":\n\n";
	    message += "  " + firstLine + "\n";
	    message += "  " + Array(token.col).join(" ") + "^";
	    return message
	  };

	  Lexer.prototype.clone = function() {
	    return new Lexer(this.states, this.state)
	  };

	  Lexer.prototype.has = function(tokenType) {
	    return true
	  };


	  return {
	    compile: compile,
	    states: compileStates,
	    error: Object.freeze({error: true}),
	    fallback: Object.freeze({fallback: true}),
	    keywords: keywordTransform,
	  }

	}));
	});

	function _defineProperty(obj, key, value) {
	  if (key in obj) {
	    Object.defineProperty(obj, key, {
	      value: value,
	      enumerable: true,
	      configurable: true,
	      writable: true
	    });
	  } else {
	    obj[key] = value;
	  }

	  return obj;
	}

	function _extends() {
	  _extends = Object.assign || function (target) {
	    for (var i = 1; i < arguments.length; i++) {
	      var source = arguments[i];

	      for (var key in source) {
	        if (Object.prototype.hasOwnProperty.call(source, key)) {
	          target[key] = source[key];
	        }
	      }
	    }

	    return target;
	  };

	  return _extends.apply(this, arguments);
	}

	function _slicedToArray(arr, i) {
	  return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest();
	}

	function _toArray(arr) {
	  return _arrayWithHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableRest();
	}

	function _toConsumableArray(arr) {
	  return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread();
	}

	function _arrayWithoutHoles(arr) {
	  if (Array.isArray(arr)) return _arrayLikeToArray(arr);
	}

	function _arrayWithHoles(arr) {
	  if (Array.isArray(arr)) return arr;
	}

	function _iterableToArray(iter) {
	  if (typeof Symbol !== "undefined" && Symbol.iterator in Object(iter)) return Array.from(iter);
	}

	function _iterableToArrayLimit(arr, i) {
	  if (typeof Symbol === "undefined" || !(Symbol.iterator in Object(arr))) return;
	  var _arr = [];
	  var _n = true;
	  var _d = false;
	  var _e = undefined;

	  try {
	    for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
	      _arr.push(_s.value);

	      if (i && _arr.length === i) break;
	    }
	  } catch (err) {
	    _d = true;
	    _e = err;
	  } finally {
	    try {
	      if (!_n && _i["return"] != null) _i["return"]();
	    } finally {
	      if (_d) throw _e;
	    }
	  }

	  return _arr;
	}

	function _unsupportedIterableToArray(o, minLen) {
	  if (!o) return;
	  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
	  var n = Object.prototype.toString.call(o).slice(8, -1);
	  if (n === "Object" && o.constructor) n = o.constructor.name;
	  if (n === "Map" || n === "Set") return Array.from(o);
	  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
	}

	function _arrayLikeToArray(arr, len) {
	  if (len == null || len > arr.length) len = arr.length;

	  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

	  return arr2;
	}

	function _nonIterableSpread() {
	  throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
	}

	function _nonIterableRest() {
	  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
	}

	/**
	 * T-code token type
	 *
	 * @category Lexer
	 */
	var T_CODE = 'T_CODE';
	/**
	 * G-code token type
	 *
	 * @category Lexer
	 */

	var G_CODE = 'G_CODE';
	/**
	 * M-code token type
	 *
	 * @category Lexer
	 */

	var M_CODE = 'M_CODE';
	/**
	 * D-code token type
	 *
	 * @category Lexer
	 */

	var D_CODE = 'D_CODE';
	/**
	 * Asterisk token type
	 *
	 * @category Lexer
	 */

	var ASTERISK = 'ASTERISK';
	/**
	 * Percent sign token type
	 *
	 * @category Lexer
	 */

	var PERCENT = 'PERCENT';
	/**
	 * Equals sign token type
	 *
	 * @category Lexer
	 */

	var EQUALS = 'EQUALS';
	/**
	 * Comma token type
	 *
	 * @category Lexer
	 */

	var COMMA = 'COMMA';
	/**
	 * Arithmatic operator token type
	 *
	 * @category Lexer
	 */

	var OPERATOR = 'OPERATOR';
	/**
	 * Gerber format specification token type
	 *
	 * @category Lexer
	 */

	var GERBER_FORMAT = 'GERBER_FORMAT';
	/**
	 * Gerber units specification token type
	 *
	 * @category Lexer
	 */

	var GERBER_UNITS = 'GERBER_UNITS';
	/**
	 * Gerber tool macro token type
	 *
	 * @category Lexer
	 */

	var GERBER_TOOL_MACRO = 'GERBER_TOOL_MACRO';
	/**
	 * Gerber tool definition token type
	 *
	 * @category Lexer
	 */

	var GERBER_TOOL_DEF = 'GERBER_TOOL_DEF';
	/**
	 * Gerber load polarity token type
	 *
	 * @category Lexer
	 */

	var GERBER_LOAD_POLARITY = 'GERBER_LOAD_POLARITY';
	/**
	 * Gerber step repear token type
	 *
	 * @category Lexer
	 */

	var GERBER_STEP_REPEAT = 'GERBER_STEP_REPEAT';
	/**
	 * Gerber macro variable token type
	 *
	 * @category Lexer
	 */

	var GERBER_MACRO_VARIABLE = 'GERBER_MACRO_VARIABLE';
	/**
	 * Semicolor token type
	 *
	 * @category Lexer
	 */

	var SEMICOLON = 'SEMICOLON';
	/**
	 * Drill file units token type
	 *
	 * @category Lexer
	 */

	var DRILL_UNITS = 'DRILL_UNITS';
	/**
	 * Drill zero-inclusion token type
	 *
	 * @category Lexer
	 */

	var DRILL_ZERO_INCLUSION = 'DRILL_ZERO_INCLUSION';
	/**
	 * Coordinate axis character token type
	 *
	 * @category Lexer
	 */

	var COORD_CHAR = 'COORD_CHAR';
	/**
	 * Number token type
	 *
	 * @category Lexer
	 */

	var NUMBER = 'NUMBER';
	/**
	 * Word token type
	 *
	 * @category Lexer
	 */

	var WORD = 'WORD';
	/**
	 * Whitespace token type
	 *
	 * @category Lexer
	 */

	var WHITESPACE = 'WHITESPACE';
	/**
	 * Newline token type
	 *
	 * @category Lexer
	 */

	var NEWLINE = 'NEWLINE';
	/**
	 * Catchall token type
	 *
	 * @category Lexer
	 */

	var CATCHALL = 'CATCHALL';
	/**
	 * Error token type
	 *
	 * @category Lexer
	 */

	var ERROR = 'ERROR';
	/**
	 * Union of all available token types
	 *
	 * @category Lexer
	 */

	var _rules;
	var RE_STRIP_LEADING_ZEROS = /^0*/;

	var stripLeadingZeros = function stripLeadingZeros(text) {
	  return text.replace(RE_STRIP_LEADING_ZEROS, '');
	};

	var getCodeValue = function getCodeValue(text) {
	  return stripLeadingZeros(text.slice(1)) || '0';
	};

	var rules = (_rules = {}, _defineProperty(_rules, T_CODE, {
	  match: /T\d+/,
	  value: getCodeValue
	}), _defineProperty(_rules, G_CODE, {
	  match: /G\d+/,
	  value: getCodeValue
	}), _defineProperty(_rules, M_CODE, {
	  match: /M\d+/,
	  value: getCodeValue
	}), _defineProperty(_rules, D_CODE, {
	  match: /D\d+/,
	  value: getCodeValue
	}), _defineProperty(_rules, ASTERISK, '*'), _defineProperty(_rules, PERCENT, '%'), _defineProperty(_rules, EQUALS, '='), _defineProperty(_rules, GERBER_FORMAT, {
	  match: /FS[LTDAI]+/,
	  value: function value(text) {
	    return text.slice(2);
	  }
	}), _defineProperty(_rules, GERBER_UNITS, {
	  match: /MO(?:IN|MM)/,
	  value: function value(text) {
	    return text.slice(2);
	  }
	}), _defineProperty(_rules, GERBER_TOOL_MACRO, {
	  // "-" in a tool name is illegal, but some gerber writers misbehave
	  // https://github.com/mcous/gerber-parser/pull/13
	  match: /AM[a-zA-Z_.$][\w.-]*/,
	  value: function value(text) {
	    return text.slice(2);
	  }
	}), _defineProperty(_rules, GERBER_TOOL_DEF, {
	  match: /ADD\d+[a-zA-Z_.$][\w.-]*/,
	  value: function value(text) {
	    return stripLeadingZeros(text.slice(3));
	  }
	}), _defineProperty(_rules, GERBER_LOAD_POLARITY, {
	  match: /LP[DC]/,
	  value: function value(text) {
	    return text.slice(2);
	  }
	}), _defineProperty(_rules, GERBER_STEP_REPEAT, 'SR'), _defineProperty(_rules, GERBER_MACRO_VARIABLE, /\$\d+/), _defineProperty(_rules, SEMICOLON, ';'), _defineProperty(_rules, DRILL_UNITS, /^(?:METRIC|INCH)/), _defineProperty(_rules, DRILL_ZERO_INCLUSION, {
	  match: /,(?:TZ|LZ)/,
	  value: function value(text) {
	    return text.slice(1);
	  }
	}), _defineProperty(_rules, COORD_CHAR, /[XYIJACFSBHZN]/), _defineProperty(_rules, NUMBER, /(?:[+-])?[\d.]+/), _defineProperty(_rules, OPERATOR, ['x', '/', '+', '-', '(', ')']), _defineProperty(_rules, COMMA, ','), _defineProperty(_rules, WORD, /[a-zA-Z]+/), _defineProperty(_rules, WHITESPACE, /[ \t]+/), _defineProperty(_rules, NEWLINE, {
	  match: /\r?\n/,
	  lineBreaks: true
	}), _defineProperty(_rules, CATCHALL, /[\S]/), _defineProperty(_rules, ERROR, moo.error), _rules);

	// gerber and drill file lexer + tokenizer
	/**
	 * {@linkcode Lexer} factory
	 *
	 * @example
	 * ```ts
	 * import {createLexer} from '@tracespace/parser'
	 *
	 * const lexer = createLexer()
	 *
	 * lexer.reset('G04 gerber string*\nM02*\n')
	 *
	 * Array.from(lexer).forEach(token => {
	 *   console.log(`${token.type}: ${token.value}`)
	 * })
	 * ```
	 *
	 * @category Lexer
	 */

	function createLexer() {
	  return moo.compile(rules);
	}
	/**
	 * The lexing module of the parser. The Lexer is generated by
	 * {@link https://github.com/no-context/moo | Moo}, which determines its API.
	 *
	 * @category Lexer
	 */

	/**
	 * {@linkcode Root} node type
	 *
	 * @category Node
	 */
	var ROOT = 'root';
	/**
	 * {@linkcode Comment} node type
	 *
	 * @category Node
	 */

	var COMMENT = 'comment';
	/**
	 * {@linkcode Done} node type
	 *
	 * @category Node
	 */

	var DONE = 'done';
	/**
	 * {@linkcode Units} node type
	 *
	 * @category Node
	 */

	var UNITS = 'units';
	/**
	 * {@linkcode CoordinateFormat} node type
	 *
	 * @category Node
	 */

	var COORDINATE_FORMAT = 'coordinateFormat';
	/**
	 * {@linkcode ToolDefinition} node type
	 *
	 * @category Node
	 */

	var TOOL_DEFINITION = 'toolDefinition';
	/**
	 * {@linkcode ToolMacro} node type
	 *
	 * @category Node
	 */

	var TOOL_MACRO = 'toolMacro';
	/**
	 * {@linkcode ToolChange} node type
	 *
	 * @category Node
	 */

	var TOOL_CHANGE = 'toolChange';
	/**
	 * {@linkcode LoadPolarity} node type
	 *
	 * @category Node
	 */

	var LOAD_POLARITY = 'loadPolarity';
	/**
	 * {@linkcode StepRepeat} node type
	 *
	 * @category Node
	 */

	var STEP_REPEAT = 'stepRepeat';
	/**
	 * {@linkcode Graphic} node type
	 *
	 * @category Node
	 */

	var GRAPHIC = 'graphic';
	/**
	 * {@linkcode InterpolateMode} node type
	 *
	 * @category Node
	 */

	var INTERPOLATE_MODE = 'interpolateMode';
	/**
	 * {@linkcode RegionMode} node type
	 *
	 * @category Node
	 */

	var REGION_MODE = 'regionMode';
	/**
	 * {@linkcode QuadrantMode} node type
	 *
	 * @category Node
	 */

	var QUADRANT_MODE = 'quadrantMode';
	/**
	 * {@linkcode Unimplemented} node type
	 *
	 * @category Node
	 */

	var UNIMPLEMENTED = 'unimplemented';
	/**
	 * {@linkcode MacroComment} node type
	 *
	 * @category Macro
	 */

	var MACRO_COMMENT = 'macroComment';
	/**
	 * {@linkcode MacroVariable} node type
	 *
	 * @category Macro
	 */

	var MACRO_VARIABLE = 'macroVariable';
	/**
	 * {@linkcode MacroPrimitive} node type
	 *
	 * @category Macro
	 */

	var MACRO_PRIMITIVE = 'macroPrimitive';

	var SINGLE_TOKEN = 'TOKEN';
	var MIN_TO_MAX = 'MIN_TO_MAX';
	function token(type, value) {
	  return {
	    rule: SINGLE_TOKEN,
	    type: type,
	    value: value
	  };
	}
	function notToken(type, value) {
	  return {
	    rule: SINGLE_TOKEN,
	    type: type,
	    value: value,
	    negate: true
	  };
	}
	function one(match) {
	  return {
	    rule: MIN_TO_MAX,
	    min: 1,
	    max: 1,
	    match: match
	  };
	}
	function zeroOrOne(match) {
	  return {
	    rule: MIN_TO_MAX,
	    min: 0,
	    max: 1,
	    match: match
	  };
	}
	function zeroOrMore(match) {
	  return {
	    rule: MIN_TO_MAX,
	    min: 0,
	    max: Infinity,
	    match: match
	  };
	}
	function oneOrMore(match) {
	  return {
	    rule: MIN_TO_MAX,
	    min: 1,
	    max: Infinity,
	    match: match
	  };
	}
	function minToMax(min, max, match) {
	  return {
	    rule: MIN_TO_MAX,
	    min: min,
	    max: max,
	    match: match
	  };
	}

	function tokensToCoordinates(tokens) {
	  return tokens.reduce(function (coords, token, i) {
	    var prev = tokens[i - 1];

	    if (token.type === NUMBER && (prev === null || prev === void 0 ? void 0 : prev.type) === COORD_CHAR) {
	      coords[prev.value.toLowerCase()] = token.value;
	    }

	    return coords;
	  }, {});
	}
	function tokensToMode(tokens) {
	  return tokens.filter(function (t) {
	    return t.type === G_CODE;
	  }).reduce(function (m, t) {
	    if (t.value === '0') return MOVE;
	    if (t.value === '1') return LINE;
	    if (t.value === '2') return CW_ARC;
	    if (t.value === '3') return CCW_ARC;
	    if (t.value === '5') return DRILL;
	    return m;
	  }, null);
	}
	function tokensToGraphic(tokens) {
	  return tokens.filter(function (t) {
	    return t.type === D_CODE;
	  }).reduce(function (g, t) {
	    if (t.value === '1') return SEGMENT;
	    if (t.value === '2') return MOVE;
	    if (t.value === '3') return SHAPE;
	    return g;
	  }, null);
	}
	function tokensToString(tokens) {
	  return tokens.map(function (t) {
	    return t.value;
	  }).join('').trim();
	}
	function tokensToPosition(tokens) {
	  var _options$head;

	  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	  var head = (_options$head = options.head) !== null && _options$head !== void 0 ? _options$head : tokens[0];
	  var tail = options.length ? tokens[tokens.indexOf(head) + options.length - 1] : tokens[tokens.length - 1];
	  return {
	    start: {
	      line: head.line,
	      column: head.col,
	      offset: head.offset
	    },
	    end: {
	      line: tail.line,
	      column: tail.col,
	      offset: tail.offset
	    }
	  };
	}

	var units = {
	  rules: [one([token(DRILL_UNITS), token(M_CODE, '71'), token(M_CODE, '72')]), zeroOrMore([token(COMMA), token(DRILL_ZERO_INCLUSION), token(NUMBER, /^0{1,8}\.0{1,8}$/)]), token(NEWLINE)],
	  createNodes: function createNodes(tokens) {
	    var units = tokens[0].value === 'INCH' || tokens[0].value === '72' ? IN : MM;
	    var zeroSuppression = tokens.filter(function (t) {
	      return t.type === DRILL_ZERO_INCLUSION;
	    }).reduce(function (z, t) {
	      if (t.value === 'LZ') return TRAILING;
	      if (t.value === 'TZ') return LEADING;
	      return z;
	    }, null);
	    var format = tokens.filter(function (t) {
	      return t.type === NUMBER;
	    }).reduce(function (_, t) {
	      var _t$value$split = t.value.split('.'),
	          _t$value$split2 = _slicedToArray(_t$value$split, 2),
	          _t$value$split2$ = _t$value$split2[0],
	          integer = _t$value$split2$ === void 0 ? '' : _t$value$split2$,
	          _t$value$split2$2 = _t$value$split2[1],
	          decimal = _t$value$split2$2 === void 0 ? '' : _t$value$split2$2;

	      return [integer.length, decimal.length];
	    }, null);
	    var nodes = [{
	      type: UNITS,
	      position: tokensToPosition(tokens.slice(0, 2)),
	      units: units
	    }];

	    if (zeroSuppression || format) {
	      nodes.push({
	        type: COORDINATE_FORMAT,
	        position: tokensToPosition(tokens.slice(1)),
	        mode: null,
	        format: format,
	        zeroSuppression: zeroSuppression
	      });
	    }

	    return nodes;
	  }
	};
	var tool = {
	  rules: [token(T_CODE), minToMax(0, 12, [token(COORD_CHAR, 'C'), token(COORD_CHAR, 'F'), token(COORD_CHAR, 'S'), token(COORD_CHAR, 'B'), token(COORD_CHAR, 'H'), token(COORD_CHAR, 'Z'), token(NUMBER)]), token(NEWLINE)],
	  createNodes: function createNodes(tokens) {
	    var code = tokens[0].value;
	    var position = tokensToPosition(tokens);

	    var _tokensToCoordinates = tokensToCoordinates(tokens.slice(1, -1)),
	        _tokensToCoordinates$ = _tokensToCoordinates.c,
	        c = _tokensToCoordinates$ === void 0 ? null : _tokensToCoordinates$;

	    var shape = c !== null ? {
	      type: CIRCLE,
	      diameter: Number(c)
	    } : null;
	    return shape ? [{
	      type: TOOL_DEFINITION,
	      hole: null,
	      position: position,
	      shape: shape,
	      code: code
	    }] : [{
	      type: TOOL_CHANGE,
	      position: position,
	      code: code
	    }];
	  }
	};
	var mode = {
	  rules: [one([token(G_CODE, '0'), token(G_CODE, '1'), token(G_CODE, '2'), token(G_CODE, '3'), token(G_CODE, '5')]), token(NEWLINE)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: INTERPOLATE_MODE,
	      position: tokensToPosition(tokens),
	      mode: tokensToMode(tokens)
	    }];
	  }
	};
	var operation = {
	  rules: [minToMax(0, 2, [token(T_CODE), token(G_CODE, '0'), token(G_CODE, '1'), token(G_CODE, '2'), token(G_CODE, '3'), token(G_CODE, '5')]), minToMax(2, 8, [token(COORD_CHAR), token(NUMBER)]), zeroOrOne([token(T_CODE)]), token(NEWLINE)],
	  createNodes: function createNodes(tokens) {
	    var graphicTokens = tokens.filter(function (t) {
	      return t.type === COORD_CHAR || t.type === NUMBER;
	    });
	    var modeToken = tokens.find(function (t) {
	      return t.type === G_CODE;
	    });
	    var toolToken = tokens.find(function (t) {
	      return t.type === T_CODE;
	    });
	    var coordinates = tokensToCoordinates(graphicTokens);
	    var code = toolToken ? toolToken.value : null;
	    var mode = tokensToMode(tokens);
	    var graphicPosition = tokensToPosition(tokens, {
	      head: graphicTokens[0],
	      length: graphicTokens.length + 1
	    });
	    var modePosition = tokensToPosition(tokens, {
	      head: modeToken,
	      length: 2
	    });
	    var toolPosition = tokensToPosition(tokens, {
	      head: toolToken,
	      length: 2
	    });
	    var nodes = [{
	      type: GRAPHIC,
	      position: graphicPosition,
	      graphic: null,
	      coordinates: coordinates
	    }];

	    if (mode) {
	      nodes.unshift({
	        type: INTERPOLATE_MODE,
	        position: modePosition,
	        mode: mode
	      });
	    }

	    if (code) {
	      nodes.unshift({
	        type: TOOL_CHANGE,
	        position: toolPosition,
	        code: code
	      });
	    }

	    return nodes;
	  }
	};
	var slot = {
	  rules: [minToMax(2, 4, [token(COORD_CHAR), token(NUMBER)]), token(G_CODE, '85'), minToMax(2, 4, [token(COORD_CHAR), token(NUMBER)]), token(NEWLINE)],
	  createNodes: function createNodes(tokens) {
	    var gCode = tokens.find(function (t) {
	      return t.type === G_CODE;
	    });
	    var splitIdx = gCode ? tokens.indexOf(gCode) : -1;
	    var start = tokensToCoordinates(tokens.slice(0, splitIdx));
	    var end = tokensToCoordinates(tokens.slice(splitIdx));
	    var coordinates = {};
	    Object.keys(start).forEach(function (k) {
	      return coordinates["".concat(k, "1")] = start[k];
	    });
	    Object.keys(end).forEach(function (k) {
	      return coordinates["".concat(k, "2")] = end[k];
	    });
	    return [{
	      type: GRAPHIC,
	      position: tokensToPosition(tokens),
	      graphic: SLOT,
	      coordinates: coordinates
	    }];
	  }
	};
	var done = {
	  rules: [one([token(M_CODE, '30'), token(M_CODE, '0')]), token(NEWLINE)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: DONE,
	      position: tokensToPosition(tokens)
	    }];
	  }
	};
	var comment = {
	  rules: [token(SEMICOLON), zeroOrMore([notToken(NEWLINE)]), token(NEWLINE)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: COMMENT,
	      comment: tokensToString(tokens.slice(1, -1)),
	      position: tokensToPosition(tokens)
	    }];
	  }
	};
	var drillSyntax = [tool, mode, operation, slot, comment, units, done].map(function (r) {
	  return _extends({}, r, {
	    filetype: DRILL
	  });
	});

	var FULL_MATCH = 'FULL_MATCH';
	var PARTIAL_MATCH = 'PARTIAL_MATCH';
	var NO_MATCH = 'NO_MATCH';
	function createMatchSyntax() {
	  for (var _len = arguments.length, grammar = new Array(_len), _key = 0; _key < _len; _key++) {
	    grammar[_key] = arguments[_key];
	  }

	  return function (state, token) {
	    return matchSyntax(state, token, grammar);
	  };
	}
	function matchSyntax(state, token, grammar) {
	  if (state === null) state = {
	    candidates: grammar,
	    tokens: []
	  };
	  var _state = state,
	      prevCandidates = _state.candidates;
	  var candidates = [];
	  var tokens = [].concat(_toConsumableArray(state.tokens), [token]);
	  var i;

	  for (i = 0; i < prevCandidates.length; i++) {
	    var rule = prevCandidates[i];
	    var result = tokenListMatches(rule.rules, tokens);

	    if (result === FULL_MATCH) {
	      var nodes = rule.createNodes(tokens);
	      return {
	        candidates: [],
	        tokens: tokens,
	        nodes: nodes,
	        filetype: rule.filetype
	      };
	    }

	    if (result === PARTIAL_MATCH) {
	      candidates.push(rule);
	    }
	  }

	  return {
	    candidates: candidates,
	    tokens: tokens
	  };
	}

	function tokenListMatches(rules, tokens) {
	  var i = 0;
	  var j = 0;
	  var multiMatchCount = 0;

	  while (i < rules.length && j < tokens.length) {
	    var rule = rules[i];
	    var _token = tokens[j];
	    var match = tokenMatches(rule, _token);

	    if (match) {
	      if (rule.rule === SINGLE_TOKEN || rule.rule === MIN_TO_MAX && multiMatchCount >= rule.max - 1) {
	        i++;
	        j++;
	        multiMatchCount = 0;
	      } else if (rule.rule === MIN_TO_MAX) {
	        j++;
	        multiMatchCount++;
	      }
	    } else if (rule.rule === MIN_TO_MAX && multiMatchCount >= rule.min) {
	      multiMatchCount = 0;
	      i++;
	    } else {
	      return NO_MATCH;
	    }
	  }

	  if (i < rules.length) return PARTIAL_MATCH;
	  return FULL_MATCH;
	}

	function tokenMatches(rule, token) {
	  if (rule.rule === SINGLE_TOKEN) {
	    var typeResult = rule.type === token.type;
	    var valueResult = rule.value == null || typeof rule.value === 'string' && rule.value === token.value || rule.value instanceof RegExp && rule.value.test(token.value);
	    var result = typeResult && valueResult;
	    return rule.negate ? !result : result;
	  }

	  if (Array.isArray(rule.match)) {
	    return rule.match.some(function (match) {
	      return tokenMatches(match, token);
	    });
	  }

	  return false;
	}

	var macroComment = {
	  rules: [token(NUMBER, '0'), zeroOrMore([notToken(ASTERISK)]), token(ASTERISK)],
	  createNodes: createMacroComment
	};
	var macroVariable = {
	  rules: [token(GERBER_MACRO_VARIABLE), token(EQUALS), oneOrMore([token(NUMBER), token(OPERATOR), token(GERBER_MACRO_VARIABLE), token(COORD_CHAR, 'X')]), token(ASTERISK)],
	  createNodes: createMacroVariable
	};
	var macroPrimitive = {
	  rules: [token(NUMBER), token(COMMA), oneOrMore([token(COMMA), token(NUMBER), token(OPERATOR), token(GERBER_MACRO_VARIABLE), token(COORD_CHAR, 'X')]), token(ASTERISK)],
	  createNodes: createMacroPrimitive
	};

	function createMacroComment(tokens) {
	  var comment = tokens.slice(1, -1).map(function (t) {
	    return t.text;
	  }).join('').trim();
	  return [{
	    type: MACRO_COMMENT,
	    position: tokensToPosition(tokens),
	    comment: comment
	  }];
	}

	function createMacroPrimitive(tokens) {
	  var code = tokens[0].value;
	  var modifiers = tokens.slice(2, -1).reduce(function (groups, token) {
	    var current = groups[groups.length - 1];

	    if (token.type !== COMMA) {
	      current.push(token);
	    } else {
	      groups.push([]);
	    }

	    return groups;
	  }, [[]]).map(parseMacroExpression);
	  return [{
	    type: MACRO_PRIMITIVE,
	    position: tokensToPosition(tokens),
	    code: code,
	    modifiers: modifiers
	  }];
	}

	function createMacroVariable(tokens) {
	  var name = tokens[0].value;
	  var value = parseMacroExpression(tokens.slice(2, -1));
	  return [{
	    type: MACRO_VARIABLE,
	    position: tokensToPosition(tokens),
	    name: name,
	    value: value
	  }];
	}

	function parseMacroExpression(tokens) {
	  var toParse = tokens.map(function (token) {
	    return token.type === COORD_CHAR ? _extends({}, token, {
	      type: OPERATOR,
	      value: 'x'
	    }) : token;
	  });
	  return parseAddition();

	  function peekNextToken() {
	    var _toParse$;

	    return (_toParse$ = toParse[0]) !== null && _toParse$ !== void 0 ? _toParse$ : null;
	  } // parse numbers, variables, and parenthesis


	  function parsePrimary() {
	    var token = toParse.shift();
	    if (token.type === NUMBER) return Number(token.value);
	    if (token.type === GERBER_MACRO_VARIABLE) return token.value; // else, we've got a parentheses group, so parse it and consume the ")"

	    var expression = parseAddition();
	    toParse.shift();
	    return expression;
	  } // parse multiplication and division operations


	  function parseMultiplication() {
	    var expression = parsePrimary();
	    var nextToken = peekNextToken();

	    while (((_nextToken = nextToken) === null || _nextToken === void 0 ? void 0 : _nextToken.type) === OPERATOR && (nextToken.value === 'x' || nextToken.value === '/')) {
	      var _nextToken;

	      toParse.shift();
	      expression = {
	        left: expression,
	        right: parsePrimary(),
	        operator: nextToken.value
	      };
	      nextToken = peekNextToken();
	    }

	    return expression;
	  }

	  function parseAddition() {
	    var expression = parseMultiplication();
	    var nextToken = peekNextToken();

	    while (((_nextToken2 = nextToken) === null || _nextToken2 === void 0 ? void 0 : _nextToken2.type) === OPERATOR && (nextToken.value === '+' || nextToken.value === '-') || ((_nextToken3 = nextToken) === null || _nextToken3 === void 0 ? void 0 : _nextToken3.type) === NUMBER) {
	      var _nextToken2, _nextToken3;

	      var operator = '+';

	      if (nextToken.type === OPERATOR) {
	        toParse.shift();
	        operator = nextToken.value;
	      }

	      var right = parseMultiplication();
	      expression = {
	        left: expression,
	        right: right,
	        operator: operator
	      };
	      nextToken = peekNextToken();
	    }

	    return expression;
	  }
	}

	var MACRO_GRAMMAR = [macroPrimitive, macroVariable, macroComment];
	function parseMacroBlocks(tokens) {
	  var matchState = null;
	  var blocks = [];
	  tokens.forEach(function (token) {
	    matchState = matchSyntax(matchState, token, MACRO_GRAMMAR);
	    if (matchState.nodes) blocks.push.apply(blocks, _toConsumableArray(matchState.nodes));
	    if (matchState.candidates.length === 0) matchState = null;
	  });
	  return blocks;
	}

	var holeParamsToShape = function holeParamsToShape(params) {
	  if (params.length === 1) {
	    var _params = _slicedToArray(params, 1),
	        diameter = _params[0];

	    return {
	      type: CIRCLE,
	      diameter: diameter
	    };
	  }

	  if (params.length === 2) {
	    var _params2 = _slicedToArray(params, 2),
	        xSize = _params2[0],
	        ySize = _params2[1];

	    return {
	      type: RECTANGLE,
	      xSize: xSize,
	      ySize: ySize
	    };
	  }

	  return null;
	};

	var done$1 = {
	  rules: [one([token(M_CODE, '0'), token(M_CODE, '2')]), token(ASTERISK)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: DONE,
	      position: tokensToPosition(tokens)
	    }];
	  }
	};
	var comment$1 = {
	  rules: [token(G_CODE, '4'), zeroOrMore([notToken(ASTERISK)]), token(ASTERISK)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: COMMENT,
	      position: tokensToPosition(tokens),
	      comment: tokensToString(tokens.slice(1, -1))
	    }];
	  }
	};
	var format = {
	  rules: [token(PERCENT), token(GERBER_FORMAT), zeroOrMore([notToken(COORD_CHAR, 'X')]), token(COORD_CHAR, 'X'), token(NUMBER), token(COORD_CHAR, 'Y'), token(NUMBER), zeroOrMore([notToken(ASTERISK)]), token(ASTERISK), // including units here is invalid syntax, but Cadence Allegro does it
	  // https://github.com/tracespace/tracespace/issues/234
	  minToMax(0, 2, [token(GERBER_UNITS), token(ASTERISK)]), token(PERCENT)],
	  createNodes: function createNodes(tokens) {
	    var _coords$x;

	    var format = null;
	    var zeroSuppression = null;
	    var mode = null;
	    var coords = tokensToCoordinates(tokens);
	    var formatEndIdx = tokens.findIndex(function (t) {
	      return t.type === ASTERISK;
	    });
	    var unitsToken = tokens.find(function (t) {
	      return t.type === GERBER_UNITS;
	    });
	    tokens.filter(function (t) {
	      return t.type === GERBER_FORMAT;
	    }).forEach(function (t) {
	      if (t.value.indexOf('T') >= 0) zeroSuppression = TRAILING;
	      if (t.value.indexOf('L') >= 0) zeroSuppression = LEADING;
	      if (t.value.indexOf('I') >= 0) mode = INCREMENTAL;
	      if (t.value.indexOf('A') >= 0) mode = ABSOLUTE;
	    });

	    if (coords.x === coords.y && ((_coords$x = coords.x) === null || _coords$x === void 0 ? void 0 : _coords$x.length) === 2) {
	      var integers = Number(coords.x[0]);
	      var decimals = Number(coords.x[1]);
	      if (integers && decimals) format = [integers, decimals];
	    }

	    var nodes = [{
	      type: COORDINATE_FORMAT,
	      position: tokensToPosition(tokens.slice(1, formatEndIdx + 1)),
	      zeroSuppression: zeroSuppression,
	      format: format,
	      mode: mode
	    }];

	    if (unitsToken) {
	      nodes.push({
	        type: UNITS,
	        position: tokensToPosition(tokens.slice(1, -1), {
	          head: unitsToken
	        }),
	        units: unitsToken.value === 'MM' ? MM : IN
	      });
	    }

	    return nodes;
	  }
	};
	var units$1 = {
	  rules: [token(PERCENT), token(GERBER_UNITS), token(ASTERISK), token(PERCENT)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: UNITS,
	      position: tokensToPosition(tokens.slice(1, -1)),
	      units: tokens[1].value === 'MM' ? MM : IN
	    }];
	  }
	};
	var toolMacro = {
	  rules: [token(PERCENT), token(GERBER_TOOL_MACRO), token(ASTERISK), zeroOrMore([notToken(PERCENT)]), token(PERCENT)],
	  createNodes: function createNodes(tokens) {
	    var name = tokens[1].value;
	    var position = tokensToPosition(tokens.slice(1, -1));
	    var blockTokens = tokens.slice(3, -1);
	    return [{
	      type: TOOL_MACRO,
	      position: position,
	      children: parseMacroBlocks(blockTokens),
	      name: name
	    }];
	  }
	};
	var toolDefinition = {
	  rules: [token(PERCENT), token(GERBER_TOOL_DEF), zeroOrMore([token(COMMA), token(NUMBER), token(COORD_CHAR, 'X')]), token(ASTERISK), token(PERCENT)],
	  createNodes: function createNodes(tokens) {
	    var shape;
	    var hole = null;
	    var toolProps = tokens[1].value.match(/(\d+)(.+)/);

	    var _ref = toolProps !== null && toolProps !== void 0 ? toolProps : [],
	        _ref2 = _slicedToArray(_ref, 3),
	        _ref2$ = _ref2[1],
	        code = _ref2$ === void 0 ? '' : _ref2$,
	        _ref2$2 = _ref2[2],
	        name = _ref2$2 === void 0 ? '' : _ref2$2;

	    var params = tokens.slice(3, -2).filter(function (t) {
	      return t.type === NUMBER;
	    }).map(function (t) {
	      return Number(t.value);
	    });

	    if (name === 'C') {
	      var _params3 = _toArray(params),
	          diameter = _params3[0],
	          holeParams = _params3.slice(1);

	      shape = {
	        type: CIRCLE,
	        diameter: diameter
	      };
	      hole = holeParamsToShape(holeParams);
	    } else if (name === 'R' || name === 'O') {
	      var _params4 = _toArray(params),
	          xSize = _params4[0],
	          ySize = _params4[1],
	          _holeParams = _params4.slice(2);

	      var type = name === 'R' ? RECTANGLE : OBROUND;
	      shape = {
	        type: type,
	        xSize: xSize,
	        ySize: ySize
	      };
	      hole = holeParamsToShape(_holeParams);
	    } else if (name === 'P') {
	      var _params5 = _toArray(params),
	          _diameter = _params5[0],
	          vertices = _params5[1],
	          _params5$ = _params5[2],
	          rotation = _params5$ === void 0 ? null : _params5$,
	          _holeParams2 = _params5.slice(3);

	      shape = {
	        type: POLYGON,
	        diameter: _diameter,
	        vertices: vertices,
	        rotation: rotation
	      };
	      hole = holeParamsToShape(_holeParams2);
	    } else {
	      shape = {
	        type: MACRO_SHAPE,
	        name: name,
	        params: params
	      };
	    }

	    return [{
	      type: TOOL_DEFINITION,
	      position: tokensToPosition(tokens.slice(1, -1)),
	      code: code,
	      shape: shape,
	      hole: hole
	    }];
	  }
	};
	var toolChange = {
	  rules: [zeroOrOne([token(G_CODE, '54')]), token(D_CODE), token(ASTERISK)],
	  createNodes: function createNodes(tokens) {
	    var _tokens$find;

	    return [{
	      type: TOOL_CHANGE,
	      position: tokensToPosition(tokens),
	      code: (_tokens$find = tokens.find(function (t) {
	        return t.type === D_CODE;
	      })) === null || _tokens$find === void 0 ? void 0 : _tokens$find.value
	    }];
	  }
	};

	var createOperationNodes = function createOperationNodes(tokens) {
	  var graphic = tokensToGraphic(tokens);
	  var coordinates = tokensToCoordinates(tokens);
	  var mode = tokensToMode(tokens);
	  var position = tokensToPosition(tokens, {
	    head: mode ? tokens[1] : tokens[0]
	  });
	  var nodes = [{
	    type: GRAPHIC,
	    position: position,
	    graphic: graphic,
	    coordinates: coordinates
	  }];

	  if (mode) {
	    var modePosition = tokensToPosition(tokens, {
	      head: tokens[0],
	      length: 2
	    });
	    nodes.unshift({
	      type: INTERPOLATE_MODE,
	      position: modePosition,
	      mode: mode
	    });
	  }

	  return nodes;
	};

	var operation$1 = {
	  rules: [zeroOrOne([token(G_CODE, '1'), token(G_CODE, '2'), token(G_CODE, '3')]), minToMax(2, 8, [token(COORD_CHAR), token(NUMBER)]), zeroOrOne([token(D_CODE, '1'), token(D_CODE, '2'), token(D_CODE, '3')]), token(ASTERISK)],
	  createNodes: createOperationNodes
	};
	var operationWithoutCoords = {
	  rules: [zeroOrOne([token(G_CODE, '1'), token(G_CODE, '2'), token(G_CODE, '3')]), one([token(D_CODE, '1'), token(D_CODE, '2'), token(D_CODE, '3')]), token(ASTERISK)],
	  createNodes: createOperationNodes
	};
	var interpolationMode = {
	  rules: [one([token(G_CODE, '1'), token(G_CODE, '2'), token(G_CODE, '3')]), token(ASTERISK)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: INTERPOLATE_MODE,
	      position: tokensToPosition(tokens),
	      mode: tokensToMode(tokens)
	    }];
	  }
	};
	var regionMode = {
	  rules: [one([token(G_CODE, '36'), token(G_CODE, '37')]), token(ASTERISK)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: REGION_MODE,
	      position: tokensToPosition(tokens),
	      region: tokens[0].value === '36'
	    }];
	  }
	};
	var quadrantMode = {
	  rules: [one([token(G_CODE, '74'), token(G_CODE, '75')]), token(ASTERISK)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: QUADRANT_MODE,
	      position: tokensToPosition(tokens),
	      quadrant: tokens[0].value === '74' ? SINGLE : MULTI
	    }];
	  }
	};
	var loadPolarity = {
	  rules: [token(PERCENT), token(GERBER_LOAD_POLARITY), token(ASTERISK), token(PERCENT)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: LOAD_POLARITY,
	      position: tokensToPosition(tokens.slice(1, -1)),
	      polarity: tokens[1].value === 'D' ? DARK : CLEAR
	    }];
	  }
	};
	var stepRepeat = {
	  rules: [token(PERCENT), token(GERBER_STEP_REPEAT), zeroOrMore([token(COORD_CHAR), token(NUMBER)]), token(ASTERISK), token(PERCENT)],
	  createNodes: function createNodes(tokens) {
	    var coordinates = tokensToCoordinates(tokens);
	    var params = Object.keys(coordinates).reduce(function (res, axis) {
	      res[axis] = Number(coordinates[axis]);
	      return res;
	    }, {});
	    return [{
	      type: STEP_REPEAT,
	      position: tokensToPosition(tokens.slice(1, -1)),
	      stepRepeat: params
	    }];
	  }
	};
	var unimplementedExtendedCommand = {
	  rules: [token(PERCENT), zeroOrMore([notToken(ASTERISK)]), token(ASTERISK), token(PERCENT)],
	  createNodes: function createNodes(tokens) {
	    return [{
	      type: UNIMPLEMENTED,
	      position: tokensToPosition(tokens.slice(1, -1)),
	      value: tokensToString(tokens)
	    }];
	  }
	};
	var gerberSyntax = [operation$1, operationWithoutCoords, interpolationMode, toolChange, toolDefinition, toolMacro, comment$1, regionMode, quadrantMode, loadPolarity, stepRepeat, format, units$1, done$1, unimplementedExtendedCommand].map(function (r) {
	  return _extends({}, r, {
	    filetype: GERBER
	  });
	});

	var matchSyntax$1 = createMatchSyntax.apply(void 0, _toConsumableArray(gerberSyntax).concat(_toConsumableArray(drillSyntax)));

	/**
	 * Gerber and NC drill file parser.
	 *
	 * @category Parser
	 */

	/**
	 * {@linkcode Parser} factory and the primary export of the library.
	 *
	 * @example
	 * ```ts
	 * import {createParser} from '@tracespace/parser'
	 *
	 * // create a parser to parse a single file
	 * const parser = createParser()
	 *
	 * // feed the parser the source file contents
	 * parser.feed('G04 gerber file contents*\nM02*\n')
	 *
	 * // get the resulting AST
	 * const tree = parser.results()
	 * ```
	 *
	 * @category Parser
	 */
	function createParser() {
	  var lexer = createLexer();
	  var root = {
	    type: ROOT,
	    filetype: null,
	    done: false,
	    children: []
	  };
	  var stash = '';
	  var lexerOffset = 0;
	  var lexerState = lexer.save();
	  return {
	    lexer: lexer,
	    feed: feed,
	    results: results
	  };

	  function feed(chunk) {
	    var currentStash = stash;
	    var currentOffset = lexerOffset;
	    var matchState = null;
	    var nextToken;
	    stash = '';
	    lexer.reset("".concat(currentStash).concat(chunk), lexerState);

	    while (nextToken = lexer.next()) {
	      var token = _extends({}, nextToken, {
	        offset: nextToken.offset + currentOffset
	      });

	      stash += nextToken.text;
	      matchState = matchSyntax$1(matchState, token);

	      if (matchState.nodes) {
	        var _lexer$index, _root$children, _root$filetype;

	        var _matchState = matchState,
	            nodes = _matchState.nodes,
	            _matchState$filetype = _matchState.filetype,
	            filetype = _matchState$filetype === void 0 ? null : _matchState$filetype;
	        stash = '';
	        lexerOffset += (_lexer$index = lexer.index) !== null && _lexer$index !== void 0 ? _lexer$index : 0;
	        lexerState = lexer.save();

	        (_root$children = root.children).push.apply(_root$children, _toConsumableArray(nodes));

	        root.filetype = (_root$filetype = root.filetype) !== null && _root$filetype !== void 0 ? _root$filetype : filetype;
	        root.done = root.done || nodes.some(function (n) {
	          return n.type === DONE;
	        });
	      }

	      if (matchState.candidates.length === 0) {
	        matchState = null;
	      }
	    }
	  }

	  function results() {
	    return root;
	  }
	}

	exports.ABSOLUTE = ABSOLUTE;
	exports.ASTERISK = ASTERISK;
	exports.CATCHALL = CATCHALL;
	exports.CCW_ARC = CCW_ARC;
	exports.CIRCLE = CIRCLE;
	exports.CLEAR = CLEAR;
	exports.COMMA = COMMA;
	exports.COMMENT = COMMENT;
	exports.COORDINATE_FORMAT = COORDINATE_FORMAT;
	exports.COORD_CHAR = COORD_CHAR;
	exports.CW_ARC = CW_ARC;
	exports.DARK = DARK;
	exports.DONE = DONE;
	exports.DRILL = DRILL;
	exports.DRILL_UNITS = DRILL_UNITS;
	exports.DRILL_ZERO_INCLUSION = DRILL_ZERO_INCLUSION;
	exports.D_CODE = D_CODE;
	exports.EQUALS = EQUALS;
	exports.ERROR = ERROR;
	exports.GERBER = GERBER;
	exports.GERBER_FORMAT = GERBER_FORMAT;
	exports.GERBER_LOAD_POLARITY = GERBER_LOAD_POLARITY;
	exports.GERBER_MACRO_VARIABLE = GERBER_MACRO_VARIABLE;
	exports.GERBER_STEP_REPEAT = GERBER_STEP_REPEAT;
	exports.GERBER_TOOL_DEF = GERBER_TOOL_DEF;
	exports.GERBER_TOOL_MACRO = GERBER_TOOL_MACRO;
	exports.GERBER_UNITS = GERBER_UNITS;
	exports.GRAPHIC = GRAPHIC;
	exports.G_CODE = G_CODE;
	exports.IN = IN;
	exports.INCREMENTAL = INCREMENTAL;
	exports.INTERPOLATE_MODE = INTERPOLATE_MODE;
	exports.LEADING = LEADING;
	exports.LINE = LINE;
	exports.LOAD_POLARITY = LOAD_POLARITY;
	exports.MACRO_CENTER_LINE = MACRO_CENTER_LINE;
	exports.MACRO_CIRCLE = MACRO_CIRCLE;
	exports.MACRO_COMMENT = MACRO_COMMENT;
	exports.MACRO_MOIRE = MACRO_MOIRE;
	exports.MACRO_OUTLINE = MACRO_OUTLINE;
	exports.MACRO_POLYGON = MACRO_POLYGON;
	exports.MACRO_PRIMITIVE = MACRO_PRIMITIVE;
	exports.MACRO_SHAPE = MACRO_SHAPE;
	exports.MACRO_THERMAL = MACRO_THERMAL;
	exports.MACRO_VARIABLE = MACRO_VARIABLE;
	exports.MACRO_VECTOR_LINE = MACRO_VECTOR_LINE;
	exports.MM = MM;
	exports.MOVE = MOVE;
	exports.MULTI = MULTI;
	exports.M_CODE = M_CODE;
	exports.NEWLINE = NEWLINE;
	exports.NUMBER = NUMBER;
	exports.OBROUND = OBROUND;
	exports.OPERATOR = OPERATOR;
	exports.PERCENT = PERCENT;
	exports.POLYGON = POLYGON;
	exports.QUADRANT_MODE = QUADRANT_MODE;
	exports.RECTANGLE = RECTANGLE;
	exports.REGION_MODE = REGION_MODE;
	exports.ROOT = ROOT;
	exports.SEGMENT = SEGMENT;
	exports.SEMICOLON = SEMICOLON;
	exports.SHAPE = SHAPE;
	exports.SINGLE = SINGLE;
	exports.SLOT = SLOT;
	exports.STEP_REPEAT = STEP_REPEAT;
	exports.TOOL_CHANGE = TOOL_CHANGE;
	exports.TOOL_DEFINITION = TOOL_DEFINITION;
	exports.TOOL_MACRO = TOOL_MACRO;
	exports.TRAILING = TRAILING;
	exports.T_CODE = T_CODE;
	exports.UNIMPLEMENTED = UNIMPLEMENTED;
	exports.UNITS = UNITS;
	exports.WHITESPACE = WHITESPACE;
	exports.WORD = WORD;
	exports.createLexer = createLexer;
	exports.createParser = createParser;

	Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=parser.js.map
