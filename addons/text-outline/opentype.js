// opentype.js@1.3.4 downloaded from https://ga.jspm.io/npm:opentype.js@1.3.4/dist/opentype.module.js
String.prototype.codePointAt||function(){var e=function(){try{var e={};var t=Object.defineProperty;var r=t(e,e,e)&&t}catch(e){}return r}();var codePointAt=function(e){if(null==this)throw TypeError();var t=String(this);var r=t.length;var a=e?Number(e):0;a!=a&&(a=0);if(!(a<0||a>=r)){var n=t.charCodeAt(a);var s;if(n>=55296&&n<=56319&&r>a+1){s=t.charCodeAt(a+1);if(s>=56320&&s<=57343)return 1024*(n-55296)+s-56320+65536}return n}};e?e(String.prototype,"codePointAt",{value:codePointAt,configurable:true,writable:true}):String.prototype.codePointAt=codePointAt}();var e=0;var t=-3;function Tree(){this.table=new Uint16Array(16);this.trans=new Uint16Array(288)}function Data(e,t){this.source=e;this.sourceIndex=0;this.tag=0;this.bitcount=0;this.dest=t;this.destLen=0;this.ltree=new Tree;this.dtree=new Tree}var r=new Tree;var a=new Tree;var n=new Uint8Array(30);var s=new Uint16Array(30);var o=new Uint8Array(30);var i=new Uint16Array(30);var u=new Uint8Array([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]);var l=new Tree;var p=new Uint8Array(320);function tinf_build_bits_base(e,t,r,a){var n,s;for(n=0;n<r;++n)e[n]=0;for(n=0;n<30-r;++n)e[n+r]=n/r|0;for(s=a,n=0;n<30;++n){t[n]=s;s+=1<<e[n]}}function tinf_build_fixed_trees(e,t){var r;for(r=0;r<7;++r)e.table[r]=0;e.table[7]=24;e.table[8]=152;e.table[9]=112;for(r=0;r<24;++r)e.trans[r]=256+r;for(r=0;r<144;++r)e.trans[24+r]=r;for(r=0;r<8;++r)e.trans[168+r]=280+r;for(r=0;r<112;++r)e.trans[176+r]=144+r;for(r=0;r<5;++r)t.table[r]=0;t.table[5]=32;for(r=0;r<32;++r)t.trans[r]=r}var c=new Uint16Array(16);function tinf_build_tree(e,t,r,a){var n,s;for(n=0;n<16;++n)e.table[n]=0;for(n=0;n<a;++n)e.table[t[r+n]]++;e.table[0]=0;for(s=0,n=0;n<16;++n){c[n]=s;s+=e.table[n]}for(n=0;n<a;++n)t[r+n]&&(e.trans[c[t[r+n]]++]=n)}function tinf_getbit(e){if(!e.bitcount--){e.tag=e.source[e.sourceIndex++];e.bitcount=7}var t=1&e.tag;e.tag>>>=1;return t}function tinf_read_bits(e,t,r){if(!t)return r;while(e.bitcount<24){e.tag|=e.source[e.sourceIndex++]<<e.bitcount;e.bitcount+=8}var a=e.tag&65535>>>16-t;e.tag>>>=t;e.bitcount-=t;return a+r}function tinf_decode_symbol(e,t){while(e.bitcount<24){e.tag|=e.source[e.sourceIndex++]<<e.bitcount;e.bitcount+=8}var r=0,a=0,n=0;var s=e.tag;do{a=2*a+(1&s);s>>>=1;++n;r+=t.table[n];a-=t.table[n]}while(a>=0);e.tag=s;e.bitcount-=n;return t.trans[r+a]}function tinf_decode_trees(e,t,r){var a,n,s;var o,i,c;a=tinf_read_bits(e,5,257);n=tinf_read_bits(e,5,1);s=tinf_read_bits(e,4,4);for(o=0;o<19;++o)p[o]=0;for(o=0;o<s;++o){var h=tinf_read_bits(e,3,0);p[u[o]]=h}tinf_build_tree(l,p,0,19);for(i=0;i<a+n;){var v=tinf_decode_symbol(e,l);switch(v){case 16:var f=p[i-1];for(c=tinf_read_bits(e,2,3);c;--c)p[i++]=f;break;case 17:for(c=tinf_read_bits(e,3,3);c;--c)p[i++]=0;break;case 18:for(c=tinf_read_bits(e,7,11);c;--c)p[i++]=0;break;default:p[i++]=v;break}}tinf_build_tree(t,p,0,a);tinf_build_tree(r,p,a,n)}function tinf_inflate_block_data(t,r,a){while(1){var u=tinf_decode_symbol(t,r);if(256===u)return e;if(u<256)t.dest[t.destLen++]=u;else{var l,p,c;var h;u-=257;l=tinf_read_bits(t,n[u],s[u]);p=tinf_decode_symbol(t,a);c=t.destLen-tinf_read_bits(t,o[p],i[p]);for(h=c;h<c+l;++h)t.dest[t.destLen++]=t.dest[h]}}}function tinf_inflate_uncompressed_block(r){var a,n;var s;while(r.bitcount>8){r.sourceIndex--;r.bitcount-=8}a=r.source[r.sourceIndex+1];a=256*a+r.source[r.sourceIndex];n=r.source[r.sourceIndex+3];n=256*n+r.source[r.sourceIndex+2];if(a!==(65535&~n))return t;r.sourceIndex+=4;for(s=a;s;--s)r.dest[r.destLen++]=r.source[r.sourceIndex++];r.bitcount=0;return e}function tinf_uncompress(n,s){var o=new Data(n,s);var i,u,l;do{i=tinf_getbit(o);u=tinf_read_bits(o,2,0);switch(u){case 0:l=tinf_inflate_uncompressed_block(o);break;case 1:l=tinf_inflate_block_data(o,r,a);break;case 2:tinf_decode_trees(o,o.ltree,o.dtree);l=tinf_inflate_block_data(o,o.ltree,o.dtree);break;default:l=t}if(l!==e)throw new Error("Data error")}while(!i);return o.destLen<o.dest.length?"function"===typeof o.dest.slice?o.dest.slice(0,o.destLen):o.dest.subarray(0,o.destLen):o.dest}tinf_build_fixed_trees(r,a);tinf_build_bits_base(n,s,4,3);tinf_build_bits_base(o,i,2,1);n[28]=0;s[28]=258;var h=tinf_uncompress;function derive(e,t,r,a,n){return Math.pow(1-n,3)*e+3*Math.pow(1-n,2)*n*t+3*(1-n)*Math.pow(n,2)*r+Math.pow(n,3)*a}function BoundingBox(){this.x1=Number.NaN;this.y1=Number.NaN;this.x2=Number.NaN;this.y2=Number.NaN}BoundingBox.prototype.isEmpty=function(){return isNaN(this.x1)||isNaN(this.y1)||isNaN(this.x2)||isNaN(this.y2)};
/**
 * Add the point to the bounding box.
 * The x1/y1/x2/y2 coordinates of the bounding box will now encompass the given point.
 * @param {number} x - The X coordinate of the point.
 * @param {number} y - The Y coordinate of the point.
 */BoundingBox.prototype.addPoint=function(e,t){if("number"===typeof e){if(isNaN(this.x1)||isNaN(this.x2)){this.x1=e;this.x2=e}e<this.x1&&(this.x1=e);e>this.x2&&(this.x2=e)}if("number"===typeof t){if(isNaN(this.y1)||isNaN(this.y2)){this.y1=t;this.y2=t}t<this.y1&&(this.y1=t);t>this.y2&&(this.y2=t)}};
/**
 * Add a X coordinate to the bounding box.
 * This extends the bounding box to include the X coordinate.
 * This function is used internally inside of addBezier.
 * @param {number} x - The X coordinate of the point.
 */BoundingBox.prototype.addX=function(e){this.addPoint(e,null)};
/**
 * Add a Y coordinate to the bounding box.
 * This extends the bounding box to include the Y coordinate.
 * This function is used internally inside of addBezier.
 * @param {number} y - The Y coordinate of the point.
 */BoundingBox.prototype.addY=function(e){this.addPoint(null,e)};
/**
 * Add a Bézier curve to the bounding box.
 * This extends the bounding box to include the entire Bézier.
 * @param {number} x0 - The starting X coordinate.
 * @param {number} y0 - The starting Y coordinate.
 * @param {number} x1 - The X coordinate of the first control point.
 * @param {number} y1 - The Y coordinate of the first control point.
 * @param {number} x2 - The X coordinate of the second control point.
 * @param {number} y2 - The Y coordinate of the second control point.
 * @param {number} x - The ending X coordinate.
 * @param {number} y - The ending Y coordinate.
 */BoundingBox.prototype.addBezier=function(e,t,r,a,n,s,o,i){var u=[e,t];var l=[r,a];var p=[n,s];var c=[o,i];this.addPoint(e,t);this.addPoint(o,i);for(var h=0;h<=1;h++){var v=6*u[h]-12*l[h]+6*p[h];var f=-3*u[h]+9*l[h]-9*p[h]+3*c[h];var d=3*l[h]-3*u[h];if(0!==f){var g=Math.pow(v,2)-4*d*f;if(!(g<0)){var m=(-v+Math.sqrt(g))/(2*f);if(0<m&&m<1){0===h&&this.addX(derive(u[h],l[h],p[h],c[h],m));1===h&&this.addY(derive(u[h],l[h],p[h],c[h],m))}var y=(-v-Math.sqrt(g))/(2*f);if(0<y&&y<1){0===h&&this.addX(derive(u[h],l[h],p[h],c[h],y));1===h&&this.addY(derive(u[h],l[h],p[h],c[h],y))}}}else{if(0===v)continue;var b=-d/v;if(0<b&&b<1){0===h&&this.addX(derive(u[h],l[h],p[h],c[h],b));1===h&&this.addY(derive(u[h],l[h],p[h],c[h],b))}}}};
/**
 * Add a quadratic curve to the bounding box.
 * This extends the bounding box to include the entire quadratic curve.
 * @param {number} x0 - The starting X coordinate.
 * @param {number} y0 - The starting Y coordinate.
 * @param {number} x1 - The X coordinate of the control point.
 * @param {number} y1 - The Y coordinate of the control point.
 * @param {number} x - The ending X coordinate.
 * @param {number} y - The ending Y coordinate.
 */BoundingBox.prototype.addQuad=function(e,t,r,a,n,s){var o=e+2/3*(r-e);var i=t+2/3*(a-t);var u=o+1/3*(n-e);var l=i+1/3*(s-t);this.addBezier(e,t,o,i,u,l,n,s)};function Path(){this.commands=[];this.fill="black";this.stroke=null;this.strokeWidth=1}
/**
 * @param  {number} x
 * @param  {number} y
 */Path.prototype.moveTo=function(e,t){this.commands.push({type:"M",x:e,y:t})};
/**
 * @param  {number} x
 * @param  {number} y
 */Path.prototype.lineTo=function(e,t){this.commands.push({type:"L",x:e,y:t})};
/**
 * Draws cubic curve
 * @function
 * curveTo
 * @memberof opentype.Path.prototype
 * @param  {number} x1 - x of control 1
 * @param  {number} y1 - y of control 1
 * @param  {number} x2 - x of control 2
 * @param  {number} y2 - y of control 2
 * @param  {number} x - x of path point
 * @param  {number} y - y of path point
 */
/**
 * Draws cubic curve
 * @function
 * bezierCurveTo
 * @memberof opentype.Path.prototype
 * @param  {number} x1 - x of control 1
 * @param  {number} y1 - y of control 1
 * @param  {number} x2 - x of control 2
 * @param  {number} y2 - y of control 2
 * @param  {number} x - x of path point
 * @param  {number} y - y of path point
 * @see curveTo
 */Path.prototype.curveTo=Path.prototype.bezierCurveTo=function(e,t,r,a,n,s){this.commands.push({type:"C",x1:e,y1:t,x2:r,y2:a,x:n,y:s})};
/**
 * Draws quadratic curve
 * @function
 * quadraticCurveTo
 * @memberof opentype.Path.prototype
 * @param  {number} x1 - x of control
 * @param  {number} y1 - y of control
 * @param  {number} x - x of path point
 * @param  {number} y - y of path point
 */
/**
 * Draws quadratic curve
 * @function
 * quadTo
 * @memberof opentype.Path.prototype
 * @param  {number} x1 - x of control
 * @param  {number} y1 - y of control
 * @param  {number} x - x of path point
 * @param  {number} y - y of path point
 */Path.prototype.quadTo=Path.prototype.quadraticCurveTo=function(e,t,r,a){this.commands.push({type:"Q",x1:e,y1:t,x:r,y:a})};Path.prototype.close=Path.prototype.closePath=function(){this.commands.push({type:"Z"})};
/**
 * Add the given path or list of commands to the commands of this path.
 * @param  {Array} pathOrCommands - another opentype.Path, an opentype.BoundingBox, or an array of commands.
 */Path.prototype.extend=function(e){if(e.commands)e=e.commands;else if(e instanceof BoundingBox){var t=e;this.moveTo(t.x1,t.y1);this.lineTo(t.x2,t.y1);this.lineTo(t.x2,t.y2);this.lineTo(t.x1,t.y2);this.close();return}Array.prototype.push.apply(this.commands,e)};
/**
 * Calculate the bounding box of the path.
 * @returns {opentype.BoundingBox}
 */Path.prototype.getBoundingBox=function(){var e=new BoundingBox;var t=0;var r=0;var a=0;var n=0;for(var s=0;s<this.commands.length;s++){var o=this.commands[s];switch(o.type){case"M":e.addPoint(o.x,o.y);t=a=o.x;r=n=o.y;break;case"L":e.addPoint(o.x,o.y);a=o.x;n=o.y;break;case"Q":e.addQuad(a,n,o.x1,o.y1,o.x,o.y);a=o.x;n=o.y;break;case"C":e.addBezier(a,n,o.x1,o.y1,o.x2,o.y2,o.x,o.y);a=o.x;n=o.y;break;case"Z":a=t;n=r;break;default:throw new Error("Unexpected path command "+o.type)}}e.isEmpty()&&e.addPoint(0,0);return e};
/**
 * Draw the path to a 2D context.
 * @param {CanvasRenderingContext2D} ctx - A 2D drawing context.
 */Path.prototype.draw=function(e){e.beginPath();for(var t=0;t<this.commands.length;t+=1){var r=this.commands[t];"M"===r.type?e.moveTo(r.x,r.y):"L"===r.type?e.lineTo(r.x,r.y):"C"===r.type?e.bezierCurveTo(r.x1,r.y1,r.x2,r.y2,r.x,r.y):"Q"===r.type?e.quadraticCurveTo(r.x1,r.y1,r.x,r.y):"Z"===r.type&&e.closePath()}if(this.fill){e.fillStyle=this.fill;e.fill()}if(this.stroke){e.strokeStyle=this.stroke;e.lineWidth=this.strokeWidth;e.stroke()}};
/**
 * Convert the Path to a string of path data instructions
 * See http://www.w3.org/TR/SVG/paths.html#PathData
 * @param  {number} [decimalPlaces=2] - The amount of decimal places for floating-point values
 * @return {string}
 */Path.prototype.toPathData=function(e){e=void 0!==e?e:2;function floatToString(t){return Math.round(t)===t?""+Math.round(t):t.toFixed(e)}function packValues(){var e=arguments;var t="";for(var r=0;r<arguments.length;r+=1){var a=e[r];a>=0&&r>0&&(t+=" ");t+=floatToString(a)}return t}var t="";for(var r=0;r<this.commands.length;r+=1){var a=this.commands[r];"M"===a.type?t+="M"+packValues(a.x,a.y):"L"===a.type?t+="L"+packValues(a.x,a.y):"C"===a.type?t+="C"+packValues(a.x1,a.y1,a.x2,a.y2,a.x,a.y):"Q"===a.type?t+="Q"+packValues(a.x1,a.y1,a.x,a.y):"Z"===a.type&&(t+="Z")}return t};
/**
 * Convert the path to an SVG <path> element, as a string.
 * @param  {number} [decimalPlaces=2] - The amount of decimal places for floating-point values
 * @return {string}
 */Path.prototype.toSVG=function(e){var t='<path d="';t+=this.toPathData(e);t+='"';this.fill&&"black"!==this.fill&&(null===this.fill?t+=' fill="none"':t+=' fill="'+this.fill+'"');this.stroke&&(t+=' stroke="'+this.stroke+'" stroke-width="'+this.strokeWidth+'"');t+="/>";return t};
/**
 * Convert the path to a DOM element.
 * @param  {number} [decimalPlaces=2] - The amount of decimal places for floating-point values
 * @return {SVGPathElement}
 */Path.prototype.toDOMElement=function(e){var t=this.toPathData(e);var r=document.createElementNS("http://www.w3.org/2000/svg","path");r.setAttribute("d",t);return r};function fail(e){throw new Error(e)}function argument(e,t){e||fail(t)}var v={fail:fail,argument:argument,assert:argument};var f=32768;var d=2147483648;var g={};var m={};var y={};function constant(e){return function(){return e}}
/**
 * Convert an 8-bit unsigned integer to a list of 1 byte.
 * @param {number}
 * @returns {Array}
 */m.BYTE=function(e){v.argument(e>=0&&e<=255,"Byte value should be between 0 and 255.");return[e]};
/**
 * @constant
 * @type {number}
 */y.BYTE=constant(1);
/**
 * Convert a 8-bit signed integer to a list of 1 byte.
 * @param {string}
 * @returns {Array}
 */m.CHAR=function(e){return[e.charCodeAt(0)]};
/**
 * @constant
 * @type {number}
 */y.CHAR=constant(1);
/**
 * Convert an ASCII string to a list of bytes.
 * @param {string}
 * @returns {Array}
 */m.CHARARRAY=function(e){if("undefined"===typeof e){e="";console.warn("Undefined CHARARRAY encountered and treated as an empty string. This is probably caused by a missing glyph name.")}var t=[];for(var r=0;r<e.length;r+=1)t[r]=e.charCodeAt(r);return t};
/**
 * @param {Array}
 * @returns {number}
 */y.CHARARRAY=function(e){return"undefined"===typeof e?0:e.length};
/**
 * Convert a 16-bit unsigned integer to a list of 2 bytes.
 * @param {number}
 * @returns {Array}
 */m.USHORT=function(e){return[e>>8&255,255&e]};
/**
 * @constant
 * @type {number}
 */y.USHORT=constant(2);
/**
 * Convert a 16-bit signed integer to a list of 2 bytes.
 * @param {number}
 * @returns {Array}
 */m.SHORT=function(e){e>=f&&(e=-(2*f-e));return[e>>8&255,255&e]};
/**
 * @constant
 * @type {number}
 */y.SHORT=constant(2);
/**
 * Convert a 24-bit unsigned integer to a list of 3 bytes.
 * @param {number}
 * @returns {Array}
 */m.UINT24=function(e){return[e>>16&255,e>>8&255,255&e]};
/**
 * @constant
 * @type {number}
 */y.UINT24=constant(3);
/**
 * Convert a 32-bit unsigned integer to a list of 4 bytes.
 * @param {number}
 * @returns {Array}
 */m.ULONG=function(e){return[e>>24&255,e>>16&255,e>>8&255,255&e]};
/**
 * @constant
 * @type {number}
 */y.ULONG=constant(4);
/**
 * Convert a 32-bit unsigned integer to a list of 4 bytes.
 * @param {number}
 * @returns {Array}
 */m.LONG=function(e){e>=d&&(e=-(2*d-e));return[e>>24&255,e>>16&255,e>>8&255,255&e]};
/**
 * @constant
 * @type {number}
 */y.LONG=constant(4);m.FIXED=m.ULONG;y.FIXED=y.ULONG;m.FWORD=m.SHORT;y.FWORD=y.SHORT;m.UFWORD=m.USHORT;y.UFWORD=y.USHORT;
/**
 * Convert a 32-bit Apple Mac timestamp integer to a list of 8 bytes, 64-bit timestamp.
 * @param {number}
 * @returns {Array}
 */m.LONGDATETIME=function(e){return[0,0,0,0,e>>24&255,e>>16&255,e>>8&255,255&e]};
/**
 * @constant
 * @type {number}
 */y.LONGDATETIME=constant(8);
/**
 * Convert a 4-char tag to a list of 4 bytes.
 * @param {string}
 * @returns {Array}
 */m.TAG=function(e){v.argument(4===e.length,"Tag should be exactly 4 ASCII characters.");return[e.charCodeAt(0),e.charCodeAt(1),e.charCodeAt(2),e.charCodeAt(3)]};
/**
 * @constant
 * @type {number}
 */y.TAG=constant(4);m.Card8=m.BYTE;y.Card8=y.BYTE;m.Card16=m.USHORT;y.Card16=y.USHORT;m.OffSize=m.BYTE;y.OffSize=y.BYTE;m.SID=m.USHORT;y.SID=y.USHORT;
/**
 * Convert a numeric operand or charstring number to a variable-size list of bytes.
 * @param {number}
 * @returns {Array}
 */m.NUMBER=function(e){if(e>=-107&&e<=107)return[e+139];if(e>=108&&e<=1131){e-=108;return[247+(e>>8),255&e]}if(e>=-1131&&e<=-108){e=-e-108;return[251+(e>>8),255&e]}return e>=-32768&&e<=32767?m.NUMBER16(e):m.NUMBER32(e)};
/**
 * @param {number}
 * @returns {number}
 */y.NUMBER=function(e){return m.NUMBER(e).length};
/**
 * Convert a signed number between -32768 and +32767 to a three-byte value.
 * This ensures we always use three bytes, but is not the most compact format.
 * @param {number}
 * @returns {Array}
 */m.NUMBER16=function(e){return[28,e>>8&255,255&e]};
/**
 * @constant
 * @type {number}
 */y.NUMBER16=constant(3);
/**
 * Convert a signed number between -(2^31) and +(2^31-1) to a five-byte value.
 * This is useful if you want to be sure you always use four bytes,
 * at the expense of wasting a few bytes for smaller numbers.
 * @param {number}
 * @returns {Array}
 */m.NUMBER32=function(e){return[29,e>>24&255,e>>16&255,e>>8&255,255&e]};
/**
 * @constant
 * @type {number}
 */y.NUMBER32=constant(5);
/**
 * @param {number}
 * @returns {Array}
 */m.REAL=function(e){var t=e.toString();var r=/\.(\d*?)(?:9{5,20}|0{5,20})\d{0,2}(?:e(.+)|$)/.exec(t);if(r){var a=parseFloat("1e"+((r[2]?+r[2]:0)+r[1].length));t=(Math.round(e*a)/a).toString()}var n="";for(var s=0,o=t.length;s<o;s+=1){var i=t[s];n+="e"===i?"-"===t[++s]?"c":"b":"."===i?"a":"-"===i?"e":i}n+=1&n.length?"f":"ff";var u=[30];for(var l=0,p=n.length;l<p;l+=2)u.push(parseInt(n.substr(l,2),16));return u};
/**
 * @param {number}
 * @returns {number}
 */y.REAL=function(e){return m.REAL(e).length};m.NAME=m.CHARARRAY;y.NAME=y.CHARARRAY;m.STRING=m.CHARARRAY;y.STRING=y.CHARARRAY;
/**
 * @param {DataView} data
 * @param {number} offset
 * @param {number} numBytes
 * @returns {string}
 */g.UTF8=function(e,t,r){var a=[];var n=r;for(var s=0;s<n;s++,t+=1)a[s]=e.getUint8(t);return String.fromCharCode.apply(null,a)};
/**
 * @param {DataView} data
 * @param {number} offset
 * @param {number} numBytes
 * @returns {string}
 */g.UTF16=function(e,t,r){var a=[];var n=r/2;for(var s=0;s<n;s++,t+=2)a[s]=e.getUint16(t);return String.fromCharCode.apply(null,a)};
/**
 * Convert a JavaScript string to UTF16-BE.
 * @param {string}
 * @returns {Array}
 */m.UTF16=function(e){var t=[];for(var r=0;r<e.length;r+=1){var a=e.charCodeAt(r);t[t.length]=a>>8&255;t[t.length]=255&a}return t};
/**
 * @param {string}
 * @returns {number}
 */y.UTF16=function(e){return 2*e.length};var b={"x-mac-croatian":"ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®Š™´¨≠ŽØ∞±≤≥∆µ∂∑∏š∫ªºΩžø¿¡¬√ƒ≈Ć«Č… ÀÃÕŒœĐ—“”‘’÷◊©⁄€‹›Æ»–·‚„‰ÂćÁčÈÍÎÏÌÓÔđÒÚÛÙıˆ˜¯πË˚¸Êæˇ","x-mac-cyrillic":"АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ†°Ґ£§•¶І®©™Ђђ≠Ѓѓ∞±≤≥іµґЈЄєЇїЉљЊњјЅ¬√ƒ≈∆«»… ЋћЌќѕ–—“”‘’÷„ЎўЏџ№Ёёяабвгдежзийклмнопрстуфхцчшщъыьэю","x-mac-gaelic":"ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØḂ±≤≥ḃĊċḊḋḞḟĠġṀæøṁṖṗɼƒſṠ«»… ÀÃÕŒœ–—“”‘’ṡẛÿŸṪ€‹›Ŷŷṫ·Ỳỳ⁊ÂÊÁËÈÍÎÏÌÓÔ♣ÒÚÛÙıÝýŴŵẄẅẀẁẂẃ","x-mac-greek":"Ä¹²É³ÖÜ΅àâä΄¨çéèêë£™îï•½‰ôö¦€ùûü†ΓΔΘΛΞΠß®©ΣΪ§≠°·Α±≤≥¥ΒΕΖΗΙΚΜΦΫΨΩάΝ¬ΟΡ≈Τ«»… ΥΧΆΈœ–―“”‘’÷ΉΊΌΎέήίόΏύαβψδεφγηιξκλμνοπώρστθωςχυζϊϋΐΰ­","x-mac-icelandic":"ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûüÝ°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€ÐðÞþý·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ","x-mac-inuit":"ᐃᐄᐅᐆᐊᐋᐱᐲᐳᐴᐸᐹᑉᑎᑏᑐᑑᑕᑖᑦᑭᑮᑯᑰᑲᑳᒃᒋᒌᒍᒎᒐᒑ°ᒡᒥᒦ•¶ᒧ®©™ᒨᒪᒫᒻᓂᓃᓄᓅᓇᓈᓐᓯᓰᓱᓲᓴᓵᔅᓕᓖᓗᓘᓚᓛᓪᔨᔩᔪᔫᔭ… ᔮᔾᕕᕖᕗ–—“”‘’ᕘᕙᕚᕝᕆᕇᕈᕉᕋᕌᕐᕿᖀᖁᖂᖃᖄᖅᖏᖐᖑᖒᖓᖔᖕᙱᙲᙳᙴᙵᙶᖖᖠᖡᖢᖣᖤᖥᖦᕼŁł","x-mac-ce":"ÄĀāÉĄÖÜáąČäčĆćéŹźĎíďĒēĖóėôöõúĚěü†°Ę£§•¶ß®©™ę¨≠ģĮįĪ≤≥īĶ∂∑łĻļĽľĹĺŅņŃ¬√ńŇ∆«»… ňŐÕőŌ–—“”‘’÷◊ōŔŕŘ‹›řŖŗŠ‚„šŚśÁŤťÍŽžŪÓÔūŮÚůŰűŲųÝýķŻŁżĢˇ",macintosh:"ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ","x-mac-romanian":"ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ĂȘ∞±≤≥¥µ∂∑∏π∫ªºΩăș¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›Țț‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ","x-mac-turkish":"ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸĞğİıŞş‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙˆ˜¯˘˙˚¸˝˛ˇ"};
/**
 * Decodes an old-style Macintosh string. Returns either a Unicode JavaScript
 * string, or 'undefined' if the encoding is unsupported. For example, we do
 * not support Chinese, Japanese or Korean because these would need large
 * mapping tables.
 * @param {DataView} dataView
 * @param {number} offset
 * @param {number} dataLength
 * @param {string} encoding
 * @returns {string}
 */g.MACSTRING=function(e,t,r,a){var n=b[a];if(void 0!==n){var s="";for(var o=0;o<r;o++){var i=e.getUint8(t+o);s+=i<=127?String.fromCharCode(i):n[127&i]}return s}};var S="function"===typeof WeakMap&&new WeakMap;var x;var getMacEncodingTable=function(e){if(!x){x={};for(var t in b)x[t]=new String(t)}var r=x[e];if(void 0!==r){if(S){var a=S.get(r);if(void 0!==a)return a}var n=b[e];if(void 0!==n){var s={};for(var o=0;o<n.length;o++)s[n.charCodeAt(o)]=o+128;S&&S.set(r,s);return s}}};
/**
 * Encodes an old-style Macintosh string. Returns a byte array upon success.
 * If the requested encoding is unsupported, or if the input string contains
 * a character that cannot be expressed in the encoding, the function returns
 * 'undefined'.
 * @param {string} str
 * @param {string} encoding
 * @returns {Array}
 */m.MACSTRING=function(e,t){var r=getMacEncodingTable(t);if(void 0!==r){var a=[];for(var n=0;n<e.length;n++){var s=e.charCodeAt(n);if(s>=128){s=r[s];if(void 0===s)return}a[n]=s}return a}};
/**
 * @param {string} str
 * @param {string} encoding
 * @returns {number}
 */y.MACSTRING=function(e,t){var r=m.MACSTRING(e,t);return void 0!==r?r.length:0};function isByteEncodable(e){return e>=-128&&e<=127}function encodeVarDeltaRunAsZeroes(e,t,r){var a=0;var n=e.length;while(t<n&&a<64&&0===e[t]){++t;++a}r.push(128|a-1);return t}function encodeVarDeltaRunAsBytes(e,t,r){var a=0;var n=e.length;var s=t;while(s<n&&a<64){var o=e[s];if(!isByteEncodable(o))break;if(0===o&&s+1<n&&0===e[s+1])break;++s;++a}r.push(a-1);for(var i=t;i<s;++i)r.push(e[i]+256&255);return s}function encodeVarDeltaRunAsWords(e,t,r){var a=0;var n=e.length;var s=t;while(s<n&&a<64){var o=e[s];if(0===o)break;if(isByteEncodable(o)&&s+1<n&&isByteEncodable(e[s+1]))break;++s;++a}r.push(64|a-1);for(var i=t;i<s;++i){var u=e[i];r.push(u+65536>>8&255,u+256&255)}return s}
/**
 * Encode a list of variation adjustment deltas.
 *
 * Variation adjustment deltas are used in ‘gvar’ and ‘cvar’ tables.
 * They indicate how points (in ‘gvar’) or values (in ‘cvar’) get adjusted
 * when generating instances of variation fonts.
 *
 * @see https://www.microsoft.com/typography/otspec/gvar.htm
 * @see https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6gvar.html
 * @param {Array}
 * @return {Array}
 */m.VARDELTAS=function(e){var t=0;var r=[];while(t<e.length){var a=e[t];t=0===a?encodeVarDeltaRunAsZeroes(e,t,r):a>=-128&&a<=127?encodeVarDeltaRunAsBytes(e,t,r):encodeVarDeltaRunAsWords(e,t,r)}return r};
/**
 * @param {Array} l
 * @returns {Array}
 */m.INDEX=function(e){var t=1;var r=[t];var a=[];for(var n=0;n<e.length;n+=1){var s=m.OBJECT(e[n]);Array.prototype.push.apply(a,s);t+=s.length;r.push(t)}if(0===a.length)return[0,0];var o=[];var i=1+Math.floor(Math.log(t)/Math.log(2))/8|0;var u=[void 0,m.BYTE,m.USHORT,m.UINT24,m.ULONG][i];for(var l=0;l<r.length;l+=1){var p=u(r[l]);Array.prototype.push.apply(o,p)}return Array.prototype.concat(m.Card16(e.length),m.OffSize(i),o,a)};
/**
 * @param {Array}
 * @returns {number}
 */y.INDEX=function(e){return m.INDEX(e).length};
/**
 * Convert an object to a CFF DICT structure.
 * The keys should be numeric.
 * The values should be objects containing name / type / value.
 * @param {Object} m
 * @returns {Array}
 */m.DICT=function(e){var t=[];var r=Object.keys(e);var a=r.length;for(var n=0;n<a;n+=1){var s=parseInt(r[n],0);var o=e[s];t=t.concat(m.OPERAND(o.value,o.type));t=t.concat(m.OPERATOR(s))}return t};
/**
 * @param {Object}
 * @returns {number}
 */y.DICT=function(e){return m.DICT(e).length};
/**
 * @param {number}
 * @returns {Array}
 */m.OPERATOR=function(e){return e<1200?[e]:[12,e-1200]};
/**
 * @param {Array} v
 * @param {string}
 * @returns {Array}
 */m.OPERAND=function(e,t){var r=[];if(Array.isArray(t))for(var a=0;a<t.length;a+=1){v.argument(e.length===t.length,"Not enough arguments given for type"+t);r=r.concat(m.OPERAND(e[a],t[a]))}else if("SID"===t)r=r.concat(m.NUMBER(e));else if("offset"===t)r=r.concat(m.NUMBER32(e));else if("number"===t)r=r.concat(m.NUMBER(e));else{if("real"!==t)throw new Error("Unknown operand type "+t);r=r.concat(m.REAL(e))}return r};m.OP=m.BYTE;y.OP=y.BYTE;var T="function"===typeof WeakMap&&new WeakMap;
/**
 * Convert a list of CharString operations to bytes.
 * @param {Array}
 * @returns {Array}
 */m.CHARSTRING=function(e){if(T){var t=T.get(e);if(void 0!==t)return t}var r=[];var a=e.length;for(var n=0;n<a;n+=1){var s=e[n];r=r.concat(m[s.type](s.value))}T&&T.set(e,r);return r};
/**
 * @param {Array}
 * @returns {number}
 */y.CHARSTRING=function(e){return m.CHARSTRING(e).length};
/**
 * Convert an object containing name / type / value to bytes.
 * @param {Object}
 * @returns {Array}
 */m.OBJECT=function(e){var t=m[e.type];v.argument(void 0!==t,"No encoding function for type "+e.type);return t(e.value)};
/**
 * @param {Object}
 * @returns {number}
 */y.OBJECT=function(e){var t=y[e.type];v.argument(void 0!==t,"No sizeOf function for type "+e.type);return t(e.value)};
/**
 * Convert a table object to bytes.
 * A table contains a list of fields containing the metadata (name, type and default value).
 * The table itself has the field values set as attributes.
 * @param {opentype.Table}
 * @returns {Array}
 */m.TABLE=function(e){var t=[];var r=e.fields.length;var a=[];var n=[];for(var s=0;s<r;s+=1){var o=e.fields[s];var i=m[o.type];v.argument(void 0!==i,"No encoding function for field type "+o.type+" ("+o.name+")");var u=e[o.name];void 0===u&&(u=o.value);var l=i(u);if("TABLE"===o.type){n.push(t.length);t=t.concat([0,0]);a.push(l)}else t=t.concat(l)}for(var p=0;p<a.length;p+=1){var c=n[p];var h=t.length;v.argument(h<65536,"Table "+e.tableName+" too big.");t[c]=h>>8;t[c+1]=255&h;t=t.concat(a[p])}return t};
/**
 * @param {opentype.Table}
 * @returns {number}
 */y.TABLE=function(e){var t=0;var r=e.fields.length;for(var a=0;a<r;a+=1){var n=e.fields[a];var s=y[n.type];v.argument(void 0!==s,"No sizeOf function for field type "+n.type+" ("+n.name+")");var o=e[n.name];void 0===o&&(o=n.value);t+=s(o);"TABLE"===n.type&&(t+=2)}return t};m.RECORD=m.TABLE;y.RECORD=y.TABLE;m.LITERAL=function(e){return e};y.LITERAL=function(e){return e.length};
/**
 * @exports opentype.Table
 * @class
 * @param {string} tableName
 * @param {Array} fields
 * @param {Object} options
 * @constructor
 */function Table(e,t,r){if(t.length&&("coverageFormat"!==t[0].name||1===t[0].value))for(var a=0;a<t.length;a+=1){var n=t[a];this[n.name]=n.value}this.tableName=e;this.fields=t;if(r){var s=Object.keys(r);for(var o=0;o<s.length;o+=1){var i=s[o];var u=r[i];void 0!==this[i]&&(this[i]=u)}}}Table.prototype.encode=function(){return m.TABLE(this)};Table.prototype.sizeOf=function(){return y.TABLE(this)};function ushortList(e,t,r){void 0===r&&(r=t.length);var a=new Array(t.length+1);a[0]={name:e+"Count",type:"USHORT",value:r};for(var n=0;n<t.length;n++)a[n+1]={name:e+n,type:"USHORT",value:t[n]};return a}function tableList(e,t,r){var a=t.length;var n=new Array(a+1);n[0]={name:e+"Count",type:"USHORT",value:a};for(var s=0;s<a;s++)n[s+1]={name:e+s,type:"TABLE",value:r(t[s],s)};return n}function recordList(e,t,r){var a=t.length;var n=[];n[0]={name:e+"Count",type:"USHORT",value:a};for(var s=0;s<a;s++)n=n.concat(r(t[s],s));return n}
/**
 * @exports opentype.Coverage
 * @class
 * @param {opentype.Table}
 * @constructor
 * @extends opentype.Table
 */function Coverage(e){1===e.format?Table.call(this,"coverageTable",[{name:"coverageFormat",type:"USHORT",value:1}].concat(ushortList("glyph",e.glyphs))):2===e.format?Table.call(this,"coverageTable",[{name:"coverageFormat",type:"USHORT",value:2}].concat(recordList("rangeRecord",e.ranges,(function(e){return[{name:"startGlyphID",type:"USHORT",value:e.start},{name:"endGlyphID",type:"USHORT",value:e.end},{name:"startCoverageIndex",type:"USHORT",value:e.index}]})))):v.assert(false,"Coverage format must be 1 or 2.")}Coverage.prototype=Object.create(Table.prototype);Coverage.prototype.constructor=Coverage;function ScriptList(e){Table.call(this,"scriptListTable",recordList("scriptRecord",e,(function(e,t){var r=e.script;var a=r.defaultLangSys;v.assert(!!a,"Unable to write GSUB: script "+e.tag+" has no default language system.");return[{name:"scriptTag"+t,type:"TAG",value:e.tag},{name:"script"+t,type:"TABLE",value:new Table("scriptTable",[{name:"defaultLangSys",type:"TABLE",value:new Table("defaultLangSys",[{name:"lookupOrder",type:"USHORT",value:0},{name:"reqFeatureIndex",type:"USHORT",value:a.reqFeatureIndex}].concat(ushortList("featureIndex",a.featureIndexes)))}].concat(recordList("langSys",r.langSysRecords,(function(e,t){var r=e.langSys;return[{name:"langSysTag"+t,type:"TAG",value:e.tag},{name:"langSys"+t,type:"TABLE",value:new Table("langSys",[{name:"lookupOrder",type:"USHORT",value:0},{name:"reqFeatureIndex",type:"USHORT",value:r.reqFeatureIndex}].concat(ushortList("featureIndex",r.featureIndexes)))}]}))))}]})))}ScriptList.prototype=Object.create(Table.prototype);ScriptList.prototype.constructor=ScriptList;
/**
 * @exports opentype.FeatureList
 * @class
 * @param {opentype.Table}
 * @constructor
 * @extends opentype.Table
 */function FeatureList(e){Table.call(this,"featureListTable",recordList("featureRecord",e,(function(e,t){var r=e.feature;return[{name:"featureTag"+t,type:"TAG",value:e.tag},{name:"feature"+t,type:"TABLE",value:new Table("featureTable",[{name:"featureParams",type:"USHORT",value:r.featureParams}].concat(ushortList("lookupListIndex",r.lookupListIndexes)))}]})))}FeatureList.prototype=Object.create(Table.prototype);FeatureList.prototype.constructor=FeatureList;
/**
 * @exports opentype.LookupList
 * @class
 * @param {opentype.Table}
 * @param {Object}
 * @constructor
 * @extends opentype.Table
 */function LookupList(e,t){Table.call(this,"lookupListTable",tableList("lookup",e,(function(e){var r=t[e.lookupType];v.assert(!!r,"Unable to write GSUB lookup type "+e.lookupType+" tables.");return new Table("lookupTable",[{name:"lookupType",type:"USHORT",value:e.lookupType},{name:"lookupFlag",type:"USHORT",value:e.lookupFlag}].concat(tableList("subtable",e.subtables,r)))})))}LookupList.prototype=Object.create(Table.prototype);LookupList.prototype.constructor=LookupList;var k={Table:Table,Record:Table,Coverage:Coverage,ScriptList:ScriptList,FeatureList:FeatureList,LookupList:LookupList,ushortList:ushortList,tableList:tableList,recordList:recordList};function getByte(e,t){return e.getUint8(t)}function getUShort(e,t){return e.getUint16(t,false)}function getShort(e,t){return e.getInt16(t,false)}function getULong(e,t){return e.getUint32(t,false)}function getFixed(e,t){var r=e.getInt16(t,false);var a=e.getUint16(t+2,false);return r+a/65535}function getTag(e,t){var r="";for(var a=t;a<t+4;a+=1)r+=String.fromCharCode(e.getInt8(a));return r}function getOffset(e,t,r){var a=0;for(var n=0;n<r;n+=1){a<<=8;a+=e.getUint8(t+n)}return a}function getBytes(e,t,r){var a=[];for(var n=t;n<r;n+=1)a.push(e.getUint8(n));return a}function bytesToString(e){var t="";for(var r=0;r<e.length;r+=1)t+=String.fromCharCode(e[r]);return t}var P={byte:1,uShort:2,short:2,uLong:4,fixed:4,longDateTime:8,tag:4};function Parser(e,t){this.data=e;this.offset=t;this.relativeOffset=0}Parser.prototype.parseByte=function(){var e=this.data.getUint8(this.offset+this.relativeOffset);this.relativeOffset+=1;return e};Parser.prototype.parseChar=function(){var e=this.data.getInt8(this.offset+this.relativeOffset);this.relativeOffset+=1;return e};Parser.prototype.parseCard8=Parser.prototype.parseByte;Parser.prototype.parseUShort=function(){var e=this.data.getUint16(this.offset+this.relativeOffset);this.relativeOffset+=2;return e};Parser.prototype.parseCard16=Parser.prototype.parseUShort;Parser.prototype.parseSID=Parser.prototype.parseUShort;Parser.prototype.parseOffset16=Parser.prototype.parseUShort;Parser.prototype.parseShort=function(){var e=this.data.getInt16(this.offset+this.relativeOffset);this.relativeOffset+=2;return e};Parser.prototype.parseF2Dot14=function(){var e=this.data.getInt16(this.offset+this.relativeOffset)/16384;this.relativeOffset+=2;return e};Parser.prototype.parseULong=function(){var e=getULong(this.data,this.offset+this.relativeOffset);this.relativeOffset+=4;return e};Parser.prototype.parseOffset32=Parser.prototype.parseULong;Parser.prototype.parseFixed=function(){var e=getFixed(this.data,this.offset+this.relativeOffset);this.relativeOffset+=4;return e};Parser.prototype.parseString=function(e){var t=this.data;var r=this.offset+this.relativeOffset;var a="";this.relativeOffset+=e;for(var n=0;n<e;n++)a+=String.fromCharCode(t.getUint8(r+n));return a};Parser.prototype.parseTag=function(){return this.parseString(4)};Parser.prototype.parseLongDateTime=function(){var e=getULong(this.data,this.offset+this.relativeOffset+4);e-=2082844800;this.relativeOffset+=8;return e};Parser.prototype.parseVersion=function(e){var t=getUShort(this.data,this.offset+this.relativeOffset);var r=getUShort(this.data,this.offset+this.relativeOffset+2);this.relativeOffset+=4;void 0===e&&(e=4096);return t+r/e/10};Parser.prototype.skip=function(e,t){void 0===t&&(t=1);this.relativeOffset+=P[e]*t};Parser.prototype.parseULongList=function(e){void 0===e&&(e=this.parseULong());var t=new Array(e);var r=this.data;var a=this.offset+this.relativeOffset;for(var n=0;n<e;n++){t[n]=r.getUint32(a);a+=4}this.relativeOffset+=4*e;return t};Parser.prototype.parseOffset16List=Parser.prototype.parseUShortList=function(e){void 0===e&&(e=this.parseUShort());var t=new Array(e);var r=this.data;var a=this.offset+this.relativeOffset;for(var n=0;n<e;n++){t[n]=r.getUint16(a);a+=2}this.relativeOffset+=2*e;return t};Parser.prototype.parseShortList=function(e){var t=new Array(e);var r=this.data;var a=this.offset+this.relativeOffset;for(var n=0;n<e;n++){t[n]=r.getInt16(a);a+=2}this.relativeOffset+=2*e;return t};Parser.prototype.parseByteList=function(e){var t=new Array(e);var r=this.data;var a=this.offset+this.relativeOffset;for(var n=0;n<e;n++)t[n]=r.getUint8(a++);this.relativeOffset+=e;return t};Parser.prototype.parseList=function(e,t){if(!t){t=e;e=this.parseUShort()}var r=new Array(e);for(var a=0;a<e;a++)r[a]=t.call(this);return r};Parser.prototype.parseList32=function(e,t){if(!t){t=e;e=this.parseULong()}var r=new Array(e);for(var a=0;a<e;a++)r[a]=t.call(this);return r};Parser.prototype.parseRecordList=function(e,t){if(!t){t=e;e=this.parseUShort()}var r=new Array(e);var a=Object.keys(t);for(var n=0;n<e;n++){var s={};for(var o=0;o<a.length;o++){var i=a[o];var u=t[i];s[i]=u.call(this)}r[n]=s}return r};Parser.prototype.parseRecordList32=function(e,t){if(!t){t=e;e=this.parseULong()}var r=new Array(e);var a=Object.keys(t);for(var n=0;n<e;n++){var s={};for(var o=0;o<a.length;o++){var i=a[o];var u=t[i];s[i]=u.call(this)}r[n]=s}return r};Parser.prototype.parseStruct=function(e){if("function"===typeof e)return e.call(this);var t=Object.keys(e);var r={};for(var a=0;a<t.length;a++){var n=t[a];var s=e[n];r[n]=s.call(this)}return r};Parser.prototype.parseValueRecord=function(e){void 0===e&&(e=this.parseUShort());if(0!==e){var t={};1&e&&(t.xPlacement=this.parseShort());2&e&&(t.yPlacement=this.parseShort());4&e&&(t.xAdvance=this.parseShort());8&e&&(t.yAdvance=this.parseShort());if(16&e){t.xPlaDevice=void 0;this.parseShort()}if(32&e){t.yPlaDevice=void 0;this.parseShort()}if(64&e){t.xAdvDevice=void 0;this.parseShort()}if(128&e){t.yAdvDevice=void 0;this.parseShort()}return t}};Parser.prototype.parseValueRecordList=function(){var e=this.parseUShort();var t=this.parseUShort();var r=new Array(t);for(var a=0;a<t;a++)r[a]=this.parseValueRecord(e);return r};Parser.prototype.parsePointer=function(e){var t=this.parseOffset16();if(t>0)return new Parser(this.data,this.offset+t).parseStruct(e)};Parser.prototype.parsePointer32=function(e){var t=this.parseOffset32();if(t>0)return new Parser(this.data,this.offset+t).parseStruct(e)};Parser.prototype.parseListOfLists=function(e){var t=this.parseOffset16List();var r=t.length;var a=this.relativeOffset;var n=new Array(r);for(var s=0;s<r;s++){var o=t[s];if(0!==o){this.relativeOffset=o;if(e){var i=this.parseOffset16List();var u=new Array(i.length);for(var l=0;l<i.length;l++){this.relativeOffset=o+i[l];u[l]=e.call(this)}n[s]=u}else n[s]=this.parseUShortList()}else n[s]=void 0}this.relativeOffset=a;return n};Parser.prototype.parseCoverage=function(){var e=this.offset+this.relativeOffset;var t=this.parseUShort();var r=this.parseUShort();if(1===t)return{format:1,glyphs:this.parseUShortList(r)};if(2===t){var a=new Array(r);for(var n=0;n<r;n++)a[n]={start:this.parseUShort(),end:this.parseUShort(),index:this.parseUShort()};return{format:2,ranges:a}}throw new Error("0x"+e.toString(16)+": Coverage format must be 1 or 2.")};Parser.prototype.parseClassDef=function(){var e=this.offset+this.relativeOffset;var t=this.parseUShort();if(1===t)return{format:1,startGlyph:this.parseUShort(),classes:this.parseUShortList()};if(2===t)return{format:2,ranges:this.parseRecordList({start:Parser.uShort,end:Parser.uShort,classId:Parser.uShort})};throw new Error("0x"+e.toString(16)+": ClassDef format must be 1 or 2.")};Parser.list=function(e,t){return function(){return this.parseList(e,t)}};Parser.list32=function(e,t){return function(){return this.parseList32(e,t)}};Parser.recordList=function(e,t){return function(){return this.parseRecordList(e,t)}};Parser.recordList32=function(e,t){return function(){return this.parseRecordList32(e,t)}};Parser.pointer=function(e){return function(){return this.parsePointer(e)}};Parser.pointer32=function(e){return function(){return this.parsePointer32(e)}};Parser.tag=Parser.prototype.parseTag;Parser.byte=Parser.prototype.parseByte;Parser.uShort=Parser.offset16=Parser.prototype.parseUShort;Parser.uShortList=Parser.prototype.parseUShortList;Parser.uLong=Parser.offset32=Parser.prototype.parseULong;Parser.uLongList=Parser.prototype.parseULongList;Parser.struct=Parser.prototype.parseStruct;Parser.coverage=Parser.prototype.parseCoverage;Parser.classDef=Parser.prototype.parseClassDef;var R={reserved:Parser.uShort,reqFeatureIndex:Parser.uShort,featureIndexes:Parser.uShortList};Parser.prototype.parseScriptList=function(){return this.parsePointer(Parser.recordList({tag:Parser.tag,script:Parser.pointer({defaultLangSys:Parser.pointer(R),langSysRecords:Parser.recordList({tag:Parser.tag,langSys:Parser.pointer(R)})})}))||[]};Parser.prototype.parseFeatureList=function(){return this.parsePointer(Parser.recordList({tag:Parser.tag,feature:Parser.pointer({featureParams:Parser.offset16,lookupListIndexes:Parser.uShortList})}))||[]};Parser.prototype.parseLookupList=function(e){return this.parsePointer(Parser.list(Parser.pointer((function(){var t=this.parseUShort();v.argument(1<=t&&t<=9,"GPOS/GSUB lookup type "+t+" unknown.");var r=this.parseUShort();var a=16&r;return{lookupType:t,lookupFlag:r,subtables:this.parseList(Parser.pointer(e[t])),markFilteringSet:a?this.parseUShort():void 0}}))))||[]};Parser.prototype.parseFeatureVariationsList=function(){return this.parsePointer32((function(){var e=this.parseUShort();var t=this.parseUShort();v.argument(1===e&&t<1,"GPOS/GSUB feature variations table unknown.");var r=this.parseRecordList32({conditionSetOffset:Parser.offset32,featureTableSubstitutionOffset:Parser.offset32});return r}))||[]};var U={getByte:getByte,getCard8:getByte,getUShort:getUShort,getCard16:getUShort,getShort:getShort,getULong:getULong,getFixed:getFixed,getTag:getTag,getOffset:getOffset,getBytes:getBytes,bytesToString:bytesToString,Parser:Parser};function parseCmapTableFormat12(e,t){t.parseUShort();e.length=t.parseULong();e.language=t.parseULong();var r;e.groupCount=r=t.parseULong();e.glyphIndexMap={};for(var a=0;a<r;a+=1){var n=t.parseULong();var s=t.parseULong();var o=t.parseULong();for(var i=n;i<=s;i+=1){e.glyphIndexMap[i]=o;o++}}}function parseCmapTableFormat4(e,t,r,a,n){e.length=t.parseUShort();e.language=t.parseUShort();var s;e.segCount=s=t.parseUShort()>>1;t.skip("uShort",3);e.glyphIndexMap={};var o=new U.Parser(r,a+n+14);var i=new U.Parser(r,a+n+16+2*s);var u=new U.Parser(r,a+n+16+4*s);var l=new U.Parser(r,a+n+16+6*s);var p=a+n+16+8*s;for(var c=0;c<s-1;c+=1){var h=void 0;var v=o.parseUShort();var f=i.parseUShort();var d=u.parseShort();var g=l.parseUShort();for(var m=f;m<=v;m+=1){if(0!==g){p=l.offset+l.relativeOffset-2;p+=g;p+=2*(m-f);h=U.getUShort(r,p);0!==h&&(h=h+d&65535)}else h=m+d&65535;e.glyphIndexMap[m]=h}}}function parseCmapTable(e,t){var r={};r.version=U.getUShort(e,t);v.argument(0===r.version,"cmap table version should be 0.");r.numTables=U.getUShort(e,t+2);var a=-1;for(var n=r.numTables-1;n>=0;n-=1){var s=U.getUShort(e,t+4+8*n);var o=U.getUShort(e,t+4+8*n+2);if(3===s&&(0===o||1===o||10===o)||0===s&&(0===o||1===o||2===o||3===o||4===o)){a=U.getULong(e,t+4+8*n+4);break}}if(-1===a)throw new Error("No valid cmap sub-tables found.");var i=new U.Parser(e,t+a);r.format=i.parseUShort();if(12===r.format)parseCmapTableFormat12(r,i);else{if(4!==r.format)throw new Error("Only format 4 and 12 cmap tables are supported (found format "+r.format+").");parseCmapTableFormat4(r,i,e,t,a)}return r}function addSegment(e,t,r){e.segments.push({end:t,start:t,delta:-(t-r),offset:0,glyphIndex:r})}function addTerminatorSegment(e){e.segments.push({end:65535,start:65535,delta:1,offset:0})}function makeCmapTable(e){var t=true;var r;for(r=e.length-1;r>0;r-=1){var a=e.get(r);if(a.unicode>65535){console.log("Adding CMAP format 12 (needed!)");t=false;break}}var n=[{name:"version",type:"USHORT",value:0},{name:"numTables",type:"USHORT",value:t?1:2},{name:"platformID",type:"USHORT",value:3},{name:"encodingID",type:"USHORT",value:1},{name:"offset",type:"ULONG",value:t?12:20}];t||(n=n.concat([{name:"cmap12PlatformID",type:"USHORT",value:3},{name:"cmap12EncodingID",type:"USHORT",value:10},{name:"cmap12Offset",type:"ULONG",value:0}]));n=n.concat([{name:"format",type:"USHORT",value:4},{name:"cmap4Length",type:"USHORT",value:0},{name:"language",type:"USHORT",value:0},{name:"segCountX2",type:"USHORT",value:0},{name:"searchRange",type:"USHORT",value:0},{name:"entrySelector",type:"USHORT",value:0},{name:"rangeShift",type:"USHORT",value:0}]);var s=new k.Table("cmap",n);s.segments=[];for(r=0;r<e.length;r+=1){var o=e.get(r);for(var i=0;i<o.unicodes.length;i+=1)addSegment(s,o.unicodes[i],r);s.segments=s.segments.sort((function(e,t){return e.start-t.start}))}addTerminatorSegment(s);var u=s.segments.length;var l=0;var p=[];var c=[];var h=[];var v=[];var f=[];var d=[];for(r=0;r<u;r+=1){var g=s.segments[r];if(g.end<=65535&&g.start<=65535){p=p.concat({name:"end_"+r,type:"USHORT",value:g.end});c=c.concat({name:"start_"+r,type:"USHORT",value:g.start});h=h.concat({name:"idDelta_"+r,type:"SHORT",value:g.delta});v=v.concat({name:"idRangeOffset_"+r,type:"USHORT",value:g.offset});void 0!==g.glyphId&&(f=f.concat({name:"glyph_"+r,type:"USHORT",value:g.glyphId}))}else l+=1;if(!t&&void 0!==g.glyphIndex){d=d.concat({name:"cmap12Start_"+r,type:"ULONG",value:g.start});d=d.concat({name:"cmap12End_"+r,type:"ULONG",value:g.end});d=d.concat({name:"cmap12Glyph_"+r,type:"ULONG",value:g.glyphIndex})}}s.segCountX2=2*(u-l);s.searchRange=2*Math.pow(2,Math.floor(Math.log(u-l)/Math.log(2)));s.entrySelector=Math.log(s.searchRange/2)/Math.log(2);s.rangeShift=s.segCountX2-s.searchRange;s.fields=s.fields.concat(p);s.fields.push({name:"reservedPad",type:"USHORT",value:0});s.fields=s.fields.concat(c);s.fields=s.fields.concat(h);s.fields=s.fields.concat(v);s.fields=s.fields.concat(f);s.cmap4Length=14+2*p.length+2+2*c.length+2*h.length+2*v.length+2*f.length;if(!t){var m=16+4*d.length;s.cmap12Offset=20+s.cmap4Length;s.fields=s.fields.concat([{name:"cmap12Format",type:"USHORT",value:12},{name:"cmap12Reserved",type:"USHORT",value:0},{name:"cmap12Length",type:"ULONG",value:m},{name:"cmap12Language",type:"ULONG",value:0},{name:"cmap12nGroups",type:"ULONG",value:d.length/3}]);s.fields=s.fields.concat(d)}return s}var C={parse:parseCmapTable,make:makeCmapTable};var L=[".notdef","space","exclam","quotedbl","numbersign","dollar","percent","ampersand","quoteright","parenleft","parenright","asterisk","plus","comma","hyphen","period","slash","zero","one","two","three","four","five","six","seven","eight","nine","colon","semicolon","less","equal","greater","question","at","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","bracketleft","backslash","bracketright","asciicircum","underscore","quoteleft","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z","braceleft","bar","braceright","asciitilde","exclamdown","cent","sterling","fraction","yen","florin","section","currency","quotesingle","quotedblleft","guillemotleft","guilsinglleft","guilsinglright","fi","fl","endash","dagger","daggerdbl","periodcentered","paragraph","bullet","quotesinglbase","quotedblbase","quotedblright","guillemotright","ellipsis","perthousand","questiondown","grave","acute","circumflex","tilde","macron","breve","dotaccent","dieresis","ring","cedilla","hungarumlaut","ogonek","caron","emdash","AE","ordfeminine","Lslash","Oslash","OE","ordmasculine","ae","dotlessi","lslash","oslash","oe","germandbls","onesuperior","logicalnot","mu","trademark","Eth","onehalf","plusminus","Thorn","onequarter","divide","brokenbar","degree","thorn","threequarters","twosuperior","registered","minus","eth","multiply","threesuperior","copyright","Aacute","Acircumflex","Adieresis","Agrave","Aring","Atilde","Ccedilla","Eacute","Ecircumflex","Edieresis","Egrave","Iacute","Icircumflex","Idieresis","Igrave","Ntilde","Oacute","Ocircumflex","Odieresis","Ograve","Otilde","Scaron","Uacute","Ucircumflex","Udieresis","Ugrave","Yacute","Ydieresis","Zcaron","aacute","acircumflex","adieresis","agrave","aring","atilde","ccedilla","eacute","ecircumflex","edieresis","egrave","iacute","icircumflex","idieresis","igrave","ntilde","oacute","ocircumflex","odieresis","ograve","otilde","scaron","uacute","ucircumflex","udieresis","ugrave","yacute","ydieresis","zcaron","exclamsmall","Hungarumlautsmall","dollaroldstyle","dollarsuperior","ampersandsmall","Acutesmall","parenleftsuperior","parenrightsuperior","266 ff","onedotenleader","zerooldstyle","oneoldstyle","twooldstyle","threeoldstyle","fouroldstyle","fiveoldstyle","sixoldstyle","sevenoldstyle","eightoldstyle","nineoldstyle","commasuperior","threequartersemdash","periodsuperior","questionsmall","asuperior","bsuperior","centsuperior","dsuperior","esuperior","isuperior","lsuperior","msuperior","nsuperior","osuperior","rsuperior","ssuperior","tsuperior","ff","ffi","ffl","parenleftinferior","parenrightinferior","Circumflexsmall","hyphensuperior","Gravesmall","Asmall","Bsmall","Csmall","Dsmall","Esmall","Fsmall","Gsmall","Hsmall","Ismall","Jsmall","Ksmall","Lsmall","Msmall","Nsmall","Osmall","Psmall","Qsmall","Rsmall","Ssmall","Tsmall","Usmall","Vsmall","Wsmall","Xsmall","Ysmall","Zsmall","colonmonetary","onefitted","rupiah","Tildesmall","exclamdownsmall","centoldstyle","Lslashsmall","Scaronsmall","Zcaronsmall","Dieresissmall","Brevesmall","Caronsmall","Dotaccentsmall","Macronsmall","figuredash","hypheninferior","Ogoneksmall","Ringsmall","Cedillasmall","questiondownsmall","oneeighth","threeeighths","fiveeighths","seveneighths","onethird","twothirds","zerosuperior","foursuperior","fivesuperior","sixsuperior","sevensuperior","eightsuperior","ninesuperior","zeroinferior","oneinferior","twoinferior","threeinferior","fourinferior","fiveinferior","sixinferior","seveninferior","eightinferior","nineinferior","centinferior","dollarinferior","periodinferior","commainferior","Agravesmall","Aacutesmall","Acircumflexsmall","Atildesmall","Adieresissmall","Aringsmall","AEsmall","Ccedillasmall","Egravesmall","Eacutesmall","Ecircumflexsmall","Edieresissmall","Igravesmall","Iacutesmall","Icircumflexsmall","Idieresissmall","Ethsmall","Ntildesmall","Ogravesmall","Oacutesmall","Ocircumflexsmall","Otildesmall","Odieresissmall","OEsmall","Oslashsmall","Ugravesmall","Uacutesmall","Ucircumflexsmall","Udieresissmall","Yacutesmall","Thornsmall","Ydieresissmall","001.000","001.001","001.002","001.003","Black","Bold","Book","Light","Medium","Regular","Roman","Semibold"];var E=["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","space","exclam","quotedbl","numbersign","dollar","percent","ampersand","quoteright","parenleft","parenright","asterisk","plus","comma","hyphen","period","slash","zero","one","two","three","four","five","six","seven","eight","nine","colon","semicolon","less","equal","greater","question","at","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","bracketleft","backslash","bracketright","asciicircum","underscore","quoteleft","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z","braceleft","bar","braceright","asciitilde","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","exclamdown","cent","sterling","fraction","yen","florin","section","currency","quotesingle","quotedblleft","guillemotleft","guilsinglleft","guilsinglright","fi","fl","","endash","dagger","daggerdbl","periodcentered","","paragraph","bullet","quotesinglbase","quotedblbase","quotedblright","guillemotright","ellipsis","perthousand","","questiondown","","grave","acute","circumflex","tilde","macron","breve","dotaccent","dieresis","","ring","cedilla","","hungarumlaut","ogonek","caron","emdash","","","","","","","","","","","","","","","","","AE","","ordfeminine","","","","","Lslash","Oslash","OE","ordmasculine","","","","","","ae","","","","dotlessi","","","lslash","oslash","oe","germandbls"];var O=["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","space","exclamsmall","Hungarumlautsmall","","dollaroldstyle","dollarsuperior","ampersandsmall","Acutesmall","parenleftsuperior","parenrightsuperior","twodotenleader","onedotenleader","comma","hyphen","period","fraction","zerooldstyle","oneoldstyle","twooldstyle","threeoldstyle","fouroldstyle","fiveoldstyle","sixoldstyle","sevenoldstyle","eightoldstyle","nineoldstyle","colon","semicolon","commasuperior","threequartersemdash","periodsuperior","questionsmall","","asuperior","bsuperior","centsuperior","dsuperior","esuperior","","","isuperior","","","lsuperior","msuperior","nsuperior","osuperior","","","rsuperior","ssuperior","tsuperior","","ff","fi","fl","ffi","ffl","parenleftinferior","","parenrightinferior","Circumflexsmall","hyphensuperior","Gravesmall","Asmall","Bsmall","Csmall","Dsmall","Esmall","Fsmall","Gsmall","Hsmall","Ismall","Jsmall","Ksmall","Lsmall","Msmall","Nsmall","Osmall","Psmall","Qsmall","Rsmall","Ssmall","Tsmall","Usmall","Vsmall","Wsmall","Xsmall","Ysmall","Zsmall","colonmonetary","onefitted","rupiah","Tildesmall","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","exclamdownsmall","centoldstyle","Lslashsmall","","","Scaronsmall","Zcaronsmall","Dieresissmall","Brevesmall","Caronsmall","","Dotaccentsmall","","","Macronsmall","","","figuredash","hypheninferior","","","Ogoneksmall","Ringsmall","Cedillasmall","","","","onequarter","onehalf","threequarters","questiondownsmall","oneeighth","threeeighths","fiveeighths","seveneighths","onethird","twothirds","","","zerosuperior","onesuperior","twosuperior","threesuperior","foursuperior","fivesuperior","sixsuperior","sevensuperior","eightsuperior","ninesuperior","zeroinferior","oneinferior","twoinferior","threeinferior","fourinferior","fiveinferior","sixinferior","seveninferior","eightinferior","nineinferior","centinferior","dollarinferior","periodinferior","commainferior","Agravesmall","Aacutesmall","Acircumflexsmall","Atildesmall","Adieresissmall","Aringsmall","AEsmall","Ccedillasmall","Egravesmall","Eacutesmall","Ecircumflexsmall","Edieresissmall","Igravesmall","Iacutesmall","Icircumflexsmall","Idieresissmall","Ethsmall","Ntildesmall","Ogravesmall","Oacutesmall","Ocircumflexsmall","Otildesmall","Odieresissmall","OEsmall","Oslashsmall","Ugravesmall","Uacutesmall","Ucircumflexsmall","Udieresissmall","Yacutesmall","Thornsmall","Ydieresissmall"];var D=[".notdef",".null","nonmarkingreturn","space","exclam","quotedbl","numbersign","dollar","percent","ampersand","quotesingle","parenleft","parenright","asterisk","plus","comma","hyphen","period","slash","zero","one","two","three","four","five","six","seven","eight","nine","colon","semicolon","less","equal","greater","question","at","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","bracketleft","backslash","bracketright","asciicircum","underscore","grave","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z","braceleft","bar","braceright","asciitilde","Adieresis","Aring","Ccedilla","Eacute","Ntilde","Odieresis","Udieresis","aacute","agrave","acircumflex","adieresis","atilde","aring","ccedilla","eacute","egrave","ecircumflex","edieresis","iacute","igrave","icircumflex","idieresis","ntilde","oacute","ograve","ocircumflex","odieresis","otilde","uacute","ugrave","ucircumflex","udieresis","dagger","degree","cent","sterling","section","bullet","paragraph","germandbls","registered","copyright","trademark","acute","dieresis","notequal","AE","Oslash","infinity","plusminus","lessequal","greaterequal","yen","mu","partialdiff","summation","product","pi","integral","ordfeminine","ordmasculine","Omega","ae","oslash","questiondown","exclamdown","logicalnot","radical","florin","approxequal","Delta","guillemotleft","guillemotright","ellipsis","nonbreakingspace","Agrave","Atilde","Otilde","OE","oe","endash","emdash","quotedblleft","quotedblright","quoteleft","quoteright","divide","lozenge","ydieresis","Ydieresis","fraction","currency","guilsinglleft","guilsinglright","fi","fl","daggerdbl","periodcentered","quotesinglbase","quotedblbase","perthousand","Acircumflex","Ecircumflex","Aacute","Edieresis","Egrave","Iacute","Icircumflex","Idieresis","Igrave","Oacute","Ocircumflex","apple","Ograve","Uacute","Ucircumflex","Ugrave","dotlessi","circumflex","tilde","macron","breve","dotaccent","ring","cedilla","hungarumlaut","ogonek","caron","Lslash","lslash","Scaron","scaron","Zcaron","zcaron","brokenbar","Eth","eth","Yacute","yacute","Thorn","thorn","minus","multiply","onesuperior","twosuperior","threesuperior","onehalf","onequarter","threequarters","franc","Gbreve","gbreve","Idotaccent","Scedilla","scedilla","Cacute","cacute","Ccaron","ccaron","dcroat"];
/**
 * This is the encoding used for fonts created from scratch.
 * It loops through all glyphs and finds the appropriate unicode value.
 * Since it's linear time, other encodings will be faster.
 * @exports opentype.DefaultEncoding
 * @class
 * @constructor
 * @param {opentype.Font}
 */function DefaultEncoding(e){this.font=e}DefaultEncoding.prototype.charToGlyphIndex=function(e){var t=e.codePointAt(0);var r=this.font.glyphs;if(r)for(var a=0;a<r.length;a+=1){var n=r.get(a);for(var s=0;s<n.unicodes.length;s+=1)if(n.unicodes[s]===t)return a}return null};
/**
 * @exports opentype.CmapEncoding
 * @class
 * @constructor
 * @param {Object} cmap - a object with the cmap encoded data
 */function CmapEncoding(e){this.cmap=e}
/**
 * @param  {string} c - the character
 * @return {number} The glyph index.
 */CmapEncoding.prototype.charToGlyphIndex=function(e){return this.cmap.glyphIndexMap[e.codePointAt(0)]||0};
/**
 * @exports opentype.CffEncoding
 * @class
 * @constructor
 * @param {string} encoding - The encoding
 * @param {Array} charset - The character set.
 */function CffEncoding(e,t){this.encoding=e;this.charset=t}
/**
 * @param  {string} s - The character
 * @return {number} The index.
 */CffEncoding.prototype.charToGlyphIndex=function(e){var t=e.codePointAt(0);var r=this.encoding[t];return this.charset.indexOf(r)};
/**
 * @exports opentype.GlyphNames
 * @class
 * @constructor
 * @param {Object} post
 */function GlyphNames(e){switch(e.version){case 1:this.names=D.slice();break;case 2:this.names=new Array(e.numberOfGlyphs);for(var t=0;t<e.numberOfGlyphs;t++)e.glyphNameIndex[t]<D.length?this.names[t]=D[e.glyphNameIndex[t]]:this.names[t]=e.names[e.glyphNameIndex[t]-D.length];break;case 2.5:this.names=new Array(e.numberOfGlyphs);for(var r=0;r<e.numberOfGlyphs;r++)this.names[r]=D[r+e.glyphNameIndex[r]];break;case 3:this.names=[];break;default:this.names=[];break}}
/**
 * Gets the index of a glyph by name.
 * @param  {string} name - The glyph name
 * @return {number} The index
 */GlyphNames.prototype.nameToGlyphIndex=function(e){return this.names.indexOf(e)};
/**
 * @param  {number} gid
 * @return {string}
 */GlyphNames.prototype.glyphIndexToName=function(e){return this.names[e]};function addGlyphNamesAll(e){var t;var r=e.tables.cmap.glyphIndexMap;var a=Object.keys(r);for(var n=0;n<a.length;n+=1){var s=a[n];var o=r[s];t=e.glyphs.get(o);t.addUnicode(parseInt(s))}for(var i=0;i<e.glyphs.length;i+=1){t=e.glyphs.get(i);e.cffEncoding?e.isCIDFont?t.name="gid"+i:t.name=e.cffEncoding.charset[i]:e.glyphNames.names&&(t.name=e.glyphNames.glyphIndexToName(i))}}function addGlyphNamesToUnicodeMap(e){e._IndexToUnicodeMap={};var t=e.tables.cmap.glyphIndexMap;var r=Object.keys(t);for(var a=0;a<r.length;a+=1){var n=r[a];var s=t[n];void 0===e._IndexToUnicodeMap[s]?e._IndexToUnicodeMap[s]={unicodes:[parseInt(n)]}:e._IndexToUnicodeMap[s].unicodes.push(parseInt(n))}}
/**
 * @alias opentype.addGlyphNames
 * @param {opentype.Font}
 * @param {Object}
 */function addGlyphNames(e,t){t.lowMemory?addGlyphNamesToUnicodeMap(e):addGlyphNamesAll(e)}function line(e,t,r,a,n){e.beginPath();e.moveTo(t,r);e.lineTo(a,n);e.stroke()}var F={line:line};function getPathDefinition(e,t){var r=t||new Path;return{configurable:true,get:function(){"function"===typeof r&&(r=r());return r},set:function(e){r=e}}}
/**
 * @typedef GlyphOptions
 * @type Object
 * @property {string} [name] - The glyph name
 * @property {number} [unicode]
 * @property {Array} [unicodes]
 * @property {number} [xMin]
 * @property {number} [yMin]
 * @property {number} [xMax]
 * @property {number} [yMax]
 * @property {number} [advanceWidth]
 */
/**
 * @exports opentype.Glyph
 * @class
 * @param {GlyphOptions}
 * @constructor
 */function Glyph(e){this.bindConstructorValues(e)}
/**
 * @param  {GlyphOptions}
 */Glyph.prototype.bindConstructorValues=function(e){this.index=e.index||0;this.name=e.name||null;this.unicode=e.unicode||void 0;this.unicodes=e.unicodes||void 0!==e.unicode?[e.unicode]:[];"xMin"in e&&(this.xMin=e.xMin);"yMin"in e&&(this.yMin=e.yMin);"xMax"in e&&(this.xMax=e.xMax);"yMax"in e&&(this.yMax=e.yMax);"advanceWidth"in e&&(this.advanceWidth=e.advanceWidth);Object.defineProperty(this,"path",getPathDefinition(this,e.path))};
/**
 * @param {number}
 */Glyph.prototype.addUnicode=function(e){0===this.unicodes.length&&(this.unicode=e);this.unicodes.push(e)};Glyph.prototype.getBoundingBox=function(){return this.path.getBoundingBox()};
/**
 * Convert the glyph to a Path we can draw on a drawing context.
 * @param  {number} [x=0] - Horizontal position of the beginning of the text.
 * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
 * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 * @param  {Object=} options - xScale, yScale to stretch the glyph.
 * @param  {opentype.Font} if hinting is to be used, the font
 * @return {opentype.Path}
 */Glyph.prototype.getPath=function(e,t,r,a,n){e=void 0!==e?e:0;t=void 0!==t?t:0;r=void 0!==r?r:72;var s;var o;a||(a={});var i=a.xScale;var u=a.yScale;a.hinting&&n&&n.hinting&&(o=this.path&&n.hinting.exec(this,r));if(o){s=n.hinting.getCommands(o);e=Math.round(e);t=Math.round(t);i=u=1}else{s=this.path.commands;var l=1/(this.path.unitsPerEm||1e3)*r;void 0===i&&(i=l);void 0===u&&(u=l)}var p=new Path;for(var c=0;c<s.length;c+=1){var h=s[c];"M"===h.type?p.moveTo(e+h.x*i,t+-h.y*u):"L"===h.type?p.lineTo(e+h.x*i,t+-h.y*u):"Q"===h.type?p.quadraticCurveTo(e+h.x1*i,t+-h.y1*u,e+h.x*i,t+-h.y*u):"C"===h.type?p.curveTo(e+h.x1*i,t+-h.y1*u,e+h.x2*i,t+-h.y2*u,e+h.x*i,t+-h.y*u):"Z"===h.type&&p.closePath()}return p};Glyph.prototype.getContours=function(){if(void 0===this.points)return[];var e=[];var t=[];for(var r=0;r<this.points.length;r+=1){var a=this.points[r];t.push(a);if(a.lastPointOfContour){e.push(t);t=[]}}v.argument(0===t.length,"There are still points left in the current contour.");return e};Glyph.prototype.getMetrics=function(){var e=this.path.commands;var t=[];var r=[];for(var a=0;a<e.length;a+=1){var n=e[a];if("Z"!==n.type){t.push(n.x);r.push(n.y)}if("Q"===n.type||"C"===n.type){t.push(n.x1);r.push(n.y1)}if("C"===n.type){t.push(n.x2);r.push(n.y2)}}var s={xMin:Math.min.apply(null,t),yMin:Math.min.apply(null,r),xMax:Math.max.apply(null,t),yMax:Math.max.apply(null,r),leftSideBearing:this.leftSideBearing};isFinite(s.xMin)||(s.xMin=0);isFinite(s.xMax)||(s.xMax=this.advanceWidth);isFinite(s.yMin)||(s.yMin=0);isFinite(s.yMax)||(s.yMax=0);s.rightSideBearing=this.advanceWidth-s.leftSideBearing-(s.xMax-s.xMin);return s};
/**
 * Draw the glyph on the given context.
 * @param  {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
 * @param  {number} [x=0] - Horizontal position of the beginning of the text.
 * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
 * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 * @param  {Object=} options - xScale, yScale to stretch the glyph.
 */Glyph.prototype.draw=function(e,t,r,a,n){this.getPath(t,r,a,n).draw(e)};
/**
 * Draw the points of the glyph.
 * On-curve points will be drawn in blue, off-curve points will be drawn in red.
 * @param  {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
 * @param  {number} [x=0] - Horizontal position of the beginning of the text.
 * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
 * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 */Glyph.prototype.drawPoints=function(e,t,r,a){function drawCircles(t,r,a,n){e.beginPath();for(var s=0;s<t.length;s+=1){e.moveTo(r+t[s].x*n,a+t[s].y*n);e.arc(r+t[s].x*n,a+t[s].y*n,2,0,2*Math.PI,false)}e.closePath();e.fill()}t=void 0!==t?t:0;r=void 0!==r?r:0;a=void 0!==a?a:24;var n=1/this.path.unitsPerEm*a;var s=[];var o=[];var i=this.path;for(var u=0;u<i.commands.length;u+=1){var l=i.commands[u];void 0!==l.x&&s.push({x:l.x,y:-l.y});void 0!==l.x1&&o.push({x:l.x1,y:-l.y1});void 0!==l.x2&&o.push({x:l.x2,y:-l.y2})}e.fillStyle="blue";drawCircles(s,t,r,n);e.fillStyle="red";drawCircles(o,t,r,n)};
/**
 * Draw lines indicating important font measurements.
 * Black lines indicate the origin of the coordinate system (point 0,0).
 * Blue lines indicate the glyph bounding box.
 * Green line indicates the advance width of the glyph.
 * @param  {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
 * @param  {number} [x=0] - Horizontal position of the beginning of the text.
 * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
 * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 */Glyph.prototype.drawMetrics=function(e,t,r,a){var n;t=void 0!==t?t:0;r=void 0!==r?r:0;a=void 0!==a?a:24;n=1/this.path.unitsPerEm*a;e.lineWidth=1;e.strokeStyle="black";F.line(e,t,-1e4,t,1e4);F.line(e,-1e4,r,1e4,r);var s=this.xMin||0;var o=this.yMin||0;var i=this.xMax||0;var u=this.yMax||0;var l=this.advanceWidth||0;e.strokeStyle="blue";F.line(e,t+s*n,-1e4,t+s*n,1e4);F.line(e,t+i*n,-1e4,t+i*n,1e4);F.line(e,-1e4,r+-o*n,1e4,r+-o*n);F.line(e,-1e4,r+-u*n,1e4,r+-u*n);e.strokeStyle="green";F.line(e,t+l*n,-1e4,t+l*n,1e4)};function defineDependentProperty(e,t,r){Object.defineProperty(e,t,{get:function(){e.path;return e[r]},set:function(t){e[r]=t},enumerable:true,configurable:true})}
/**
 * A GlyphSet represents all glyphs available in the font, but modelled using
 * a deferred glyph loader, for retrieving glyphs only once they are absolutely
 * necessary, to keep the memory footprint down.
 * @exports opentype.GlyphSet
 * @class
 * @param {opentype.Font}
 * @param {Array}
 */function GlyphSet(e,t){this.font=e;this.glyphs={};if(Array.isArray(t))for(var r=0;r<t.length;r++){var a=t[r];a.path.unitsPerEm=e.unitsPerEm;this.glyphs[r]=a}this.length=t&&t.length||0}
/**
 * @param  {number} index
 * @return {opentype.Glyph}
 */GlyphSet.prototype.get=function(e){if(void 0===this.glyphs[e]){this.font._push(e);"function"===typeof this.glyphs[e]&&(this.glyphs[e]=this.glyphs[e]());var t=this.glyphs[e];var r=this.font._IndexToUnicodeMap[e];if(r)for(var a=0;a<r.unicodes.length;a++)t.addUnicode(r.unicodes[a]);this.font.cffEncoding?this.font.isCIDFont?t.name="gid"+e:t.name=this.font.cffEncoding.charset[e]:this.font.glyphNames.names&&(t.name=this.font.glyphNames.glyphIndexToName(e));this.glyphs[e].advanceWidth=this.font._hmtxTableData[e].advanceWidth;this.glyphs[e].leftSideBearing=this.font._hmtxTableData[e].leftSideBearing}else"function"===typeof this.glyphs[e]&&(this.glyphs[e]=this.glyphs[e]());return this.glyphs[e]};
/**
 * @param  {number} index
 * @param  {Object}
 */GlyphSet.prototype.push=function(e,t){this.glyphs[e]=t;this.length++};
/**
 * @alias opentype.glyphLoader
 * @param  {opentype.Font} font
 * @param  {number} index
 * @return {opentype.Glyph}
 */function glyphLoader(e,t){return new Glyph({index:t,font:e})}
/**
 * Generate a stub glyph that can be filled with all metadata *except*
 * the "points" and "path" properties, which must be loaded only once
 * the glyph's path is actually requested for text shaping.
 * @alias opentype.ttfGlyphLoader
 * @param  {opentype.Font} font
 * @param  {number} index
 * @param  {Function} parseGlyph
 * @param  {Object} data
 * @param  {number} position
 * @param  {Function} buildPath
 * @return {opentype.Glyph}
 */function ttfGlyphLoader(e,t,r,a,n,s){return function(){var o=new Glyph({index:t,font:e});o.path=function(){r(o,a,n);var t=s(e.glyphs,o);t.unitsPerEm=e.unitsPerEm;return t};defineDependentProperty(o,"xMin","_xMin");defineDependentProperty(o,"xMax","_xMax");defineDependentProperty(o,"yMin","_yMin");defineDependentProperty(o,"yMax","_yMax");return o}}
/**
 * @alias opentype.cffGlyphLoader
 * @param  {opentype.Font} font
 * @param  {number} index
 * @param  {Function} parseCFFCharstring
 * @param  {string} charstring
 * @return {opentype.Glyph}
 */function cffGlyphLoader(e,t,r,a){return function(){var n=new Glyph({index:t,font:e});n.path=function(){var t=r(e,n,a);t.unitsPerEm=e.unitsPerEm;return t};return n}}var w={GlyphSet:GlyphSet,glyphLoader:glyphLoader,ttfGlyphLoader:ttfGlyphLoader,cffGlyphLoader:cffGlyphLoader};function equals(e,t){if(e===t)return true;if(Array.isArray(e)&&Array.isArray(t)){if(e.length!==t.length)return false;for(var r=0;r<e.length;r+=1)if(!equals(e[r],t[r]))return false;return true}return false}function calcCFFSubroutineBias(e){var t;t=e.length<1240?107:e.length<33900?1131:32768;return t}function parseCFFIndex(e,t,r){var a=[];var n=[];var s=U.getCard16(e,t);var o;var i;if(0!==s){var u=U.getByte(e,t+2);o=t+(s+1)*u+2;var l=t+3;for(var p=0;p<s+1;p+=1){a.push(U.getOffset(e,l,u));l+=u}i=o+a[s]}else i=t+2;for(var c=0;c<a.length-1;c+=1){var h=U.getBytes(e,o+a[c],o+a[c+1]);r&&(h=r(h));n.push(h)}return{objects:n,startOffset:t,endOffset:i}}function parseCFFIndexLowMemory(e,t){var r=[];var a=U.getCard16(e,t);var n;var s;if(0!==a){var o=U.getByte(e,t+2);n=t+(a+1)*o+2;var i=t+3;for(var u=0;u<a+1;u+=1){r.push(U.getOffset(e,i,o));i+=o}s=n+r[a]}else s=t+2;return{offsets:r,startOffset:t,endOffset:s}}function getCffIndexObject(e,t,r,a,n){var s=U.getCard16(r,a);var o=0;if(0!==s){var i=U.getByte(r,a+2);o=a+(s+1)*i+2}var u=U.getBytes(r,o+t[e],o+t[e+1]);n&&(u=n(u));return u}function parseFloatOperand(e){var t="";var r=15;var a=["0","1","2","3","4","5","6","7","8","9",".","E","E-",null,"-"];while(true){var n=e.parseByte();var s=n>>4;var o=15&n;if(s===r)break;t+=a[s];if(o===r)break;t+=a[o]}return parseFloat(t)}function parseOperand(e,t){var r;var a;var n;var s;if(28===t){r=e.parseByte();a=e.parseByte();return r<<8|a}if(29===t){r=e.parseByte();a=e.parseByte();n=e.parseByte();s=e.parseByte();return r<<24|a<<16|n<<8|s}if(30===t)return parseFloatOperand(e);if(t>=32&&t<=246)return t-139;if(t>=247&&t<=250){r=e.parseByte();return 256*(t-247)+r+108}if(t>=251&&t<=254){r=e.parseByte();return 256*-(t-251)-r-108}throw new Error("Invalid b0 "+t)}function entriesToObject(e){var t={};for(var r=0;r<e.length;r+=1){var a=e[r][0];var n=e[r][1];var s=void 0;s=1===n.length?n[0]:n;if(t.hasOwnProperty(a)&&!isNaN(t[a]))throw new Error("Object "+t+" already has key "+a);t[a]=s}return t}function parseCFFDict(e,t,r){t=void 0!==t?t:0;var a=new U.Parser(e,t);var n=[];var s=[];r=void 0!==r?r:e.length;while(a.relativeOffset<r){var o=a.parseByte();if(o<=21){12===o&&(o=1200+a.parseByte());n.push([o,s]);s=[]}else s.push(parseOperand(a,o))}return entriesToObject(n)}function getCFFString(e,t){t=t<=390?L[t]:e[t-391];return t}function interpretDict(e,t,r){var a={};var n;for(var s=0;s<t.length;s+=1){var o=t[s];if(Array.isArray(o.type)){var i=[];i.length=o.type.length;for(var u=0;u<o.type.length;u++){n=void 0!==e[o.op]?e[o.op][u]:void 0;void 0===n&&(n=void 0!==o.value&&void 0!==o.value[u]?o.value[u]:null);"SID"===o.type[u]&&(n=getCFFString(r,n));i[u]=n}a[o.name]=i}else{n=e[o.op];void 0===n&&(n=void 0!==o.value?o.value:null);"SID"===o.type&&(n=getCFFString(r,n));a[o.name]=n}}return a}function parseCFFHeader(e,t){var r={};r.formatMajor=U.getCard8(e,t);r.formatMinor=U.getCard8(e,t+1);r.size=U.getCard8(e,t+2);r.offsetSize=U.getCard8(e,t+3);r.startOffset=t;r.endOffset=t+4;return r}var I=[{name:"version",op:0,type:"SID"},{name:"notice",op:1,type:"SID"},{name:"copyright",op:1200,type:"SID"},{name:"fullName",op:2,type:"SID"},{name:"familyName",op:3,type:"SID"},{name:"weight",op:4,type:"SID"},{name:"isFixedPitch",op:1201,type:"number",value:0},{name:"italicAngle",op:1202,type:"number",value:0},{name:"underlinePosition",op:1203,type:"number",value:-100},{name:"underlineThickness",op:1204,type:"number",value:50},{name:"paintType",op:1205,type:"number",value:0},{name:"charstringType",op:1206,type:"number",value:2},{name:"fontMatrix",op:1207,type:["real","real","real","real","real","real"],value:[.001,0,0,.001,0,0]},{name:"uniqueId",op:13,type:"number"},{name:"fontBBox",op:5,type:["number","number","number","number"],value:[0,0,0,0]},{name:"strokeWidth",op:1208,type:"number",value:0},{name:"xuid",op:14,type:[],value:null},{name:"charset",op:15,type:"offset",value:0},{name:"encoding",op:16,type:"offset",value:0},{name:"charStrings",op:17,type:"offset",value:0},{name:"private",op:18,type:["number","offset"],value:[0,0]},{name:"ros",op:1230,type:["SID","SID","number"]},{name:"cidFontVersion",op:1231,type:"number",value:0},{name:"cidFontRevision",op:1232,type:"number",value:0},{name:"cidFontType",op:1233,type:"number",value:0},{name:"cidCount",op:1234,type:"number",value:8720},{name:"uidBase",op:1235,type:"number"},{name:"fdArray",op:1236,type:"offset"},{name:"fdSelect",op:1237,type:"offset"},{name:"fontName",op:1238,type:"SID"}];var M=[{name:"subrs",op:19,type:"offset",value:0},{name:"defaultWidthX",op:20,type:"number",value:0},{name:"nominalWidthX",op:21,type:"number",value:0}];function parseCFFTopDict(e,t){var r=parseCFFDict(e,0,e.byteLength);return interpretDict(r,I,t)}function parseCFFPrivateDict(e,t,r,a){var n=parseCFFDict(e,t,r);return interpretDict(n,M,a)}function gatherCFFTopDicts(e,t,r,a){var n=[];for(var s=0;s<r.length;s+=1){var o=new DataView(new Uint8Array(r[s]).buffer);var i=parseCFFTopDict(o,a);i._subrs=[];i._subrsBias=0;i._defaultWidthX=0;i._nominalWidthX=0;var u=i.private[0];var l=i.private[1];if(0!==u&&0!==l){var p=parseCFFPrivateDict(e,l+t,u,a);i._defaultWidthX=p.defaultWidthX;i._nominalWidthX=p.nominalWidthX;if(0!==p.subrs){var c=l+p.subrs;var h=parseCFFIndex(e,c+t);i._subrs=h.objects;i._subrsBias=calcCFFSubroutineBias(i._subrs)}i._privateDict=p}n.push(i)}return n}function parseCFFCharset(e,t,r,a){var n;var s;var o=new U.Parser(e,t);r-=1;var i=[".notdef"];var u=o.parseCard8();if(0===u)for(var l=0;l<r;l+=1){n=o.parseSID();i.push(getCFFString(a,n))}else if(1===u)while(i.length<=r){n=o.parseSID();s=o.parseCard8();for(var p=0;p<=s;p+=1){i.push(getCFFString(a,n));n+=1}}else{if(2!==u)throw new Error("Unknown charset format "+u);while(i.length<=r){n=o.parseSID();s=o.parseCard16();for(var c=0;c<=s;c+=1){i.push(getCFFString(a,n));n+=1}}}return i}function parseCFFEncoding(e,t,r){var a;var n={};var s=new U.Parser(e,t);var o=s.parseCard8();if(0===o){var i=s.parseCard8();for(var u=0;u<i;u+=1){a=s.parseCard8();n[a]=u}}else{if(1!==o)throw new Error("Unknown encoding format "+o);var l=s.parseCard8();a=1;for(var p=0;p<l;p+=1){var c=s.parseCard8();var h=s.parseCard8();for(var v=c;v<=c+h;v+=1){n[v]=a;a+=1}}}return new CffEncoding(n,r)}function parseCFFCharstring(e,t,r){var a;var n;var s;var o;var i=new Path;var u=[];var l=0;var p=false;var c=false;var h=0;var v=0;var f;var d;var g;var m;if(e.isCIDFont){var y=e.tables.cff.topDict._fdSelect[t.index];var b=e.tables.cff.topDict._fdArray[y];f=b._subrs;d=b._subrsBias;g=b._defaultWidthX;m=b._nominalWidthX}else{f=e.tables.cff.topDict._subrs;d=e.tables.cff.topDict._subrsBias;g=e.tables.cff.topDict._defaultWidthX;m=e.tables.cff.topDict._nominalWidthX}var S=g;function newContour(e,t){c&&i.closePath();i.moveTo(e,t);c=true}function parseStems(){var e;e=u.length%2!==0;e&&!p&&(S=u.shift()+m);l+=u.length>>1;u.length=0;p=true}function parse(r){var g;var y;var b;var x;var T;var k;var P;var R;var U;var C;var L;var E;var O=0;while(O<r.length){var D=r[O];O+=1;switch(D){case 1:parseStems();break;case 3:parseStems();break;case 4:if(u.length>1&&!p){S=u.shift()+m;p=true}v+=u.pop();newContour(h,v);break;case 5:while(u.length>0){h+=u.shift();v+=u.shift();i.lineTo(h,v)}break;case 6:while(u.length>0){h+=u.shift();i.lineTo(h,v);if(0===u.length)break;v+=u.shift();i.lineTo(h,v)}break;case 7:while(u.length>0){v+=u.shift();i.lineTo(h,v);if(0===u.length)break;h+=u.shift();i.lineTo(h,v)}break;case 8:while(u.length>0){a=h+u.shift();n=v+u.shift();s=a+u.shift();o=n+u.shift();h=s+u.shift();v=o+u.shift();i.curveTo(a,n,s,o,h,v)}break;case 10:T=u.pop()+d;k=f[T];k&&parse(k);break;case 11:return;case 12:D=r[O];O+=1;switch(D){case 35:a=h+u.shift();n=v+u.shift();s=a+u.shift();o=n+u.shift();P=s+u.shift();R=o+u.shift();U=P+u.shift();C=R+u.shift();L=U+u.shift();E=C+u.shift();h=L+u.shift();v=E+u.shift();u.shift();i.curveTo(a,n,s,o,P,R);i.curveTo(U,C,L,E,h,v);break;case 34:a=h+u.shift();n=v;s=a+u.shift();o=n+u.shift();P=s+u.shift();R=o;U=P+u.shift();C=o;L=U+u.shift();E=v;h=L+u.shift();i.curveTo(a,n,s,o,P,R);i.curveTo(U,C,L,E,h,v);break;case 36:a=h+u.shift();n=v+u.shift();s=a+u.shift();o=n+u.shift();P=s+u.shift();R=o;U=P+u.shift();C=o;L=U+u.shift();E=C+u.shift();h=L+u.shift();i.curveTo(a,n,s,o,P,R);i.curveTo(U,C,L,E,h,v);break;case 37:a=h+u.shift();n=v+u.shift();s=a+u.shift();o=n+u.shift();P=s+u.shift();R=o+u.shift();U=P+u.shift();C=R+u.shift();L=U+u.shift();E=C+u.shift();Math.abs(L-h)>Math.abs(E-v)?h=L+u.shift():v=E+u.shift();i.curveTo(a,n,s,o,P,R);i.curveTo(U,C,L,E,h,v);break;default:console.log("Glyph "+t.index+": unknown operator 1200"+D);u.length=0}break;case 14:if(u.length>0&&!p){S=u.shift()+m;p=true}if(c){i.closePath();c=false}break;case 18:parseStems();break;case 19:case 20:parseStems();O+=l+7>>3;break;case 21:if(u.length>2&&!p){S=u.shift()+m;p=true}v+=u.pop();h+=u.pop();newContour(h,v);break;case 22:if(u.length>1&&!p){S=u.shift()+m;p=true}h+=u.pop();newContour(h,v);break;case 23:parseStems();break;case 24:while(u.length>2){a=h+u.shift();n=v+u.shift();s=a+u.shift();o=n+u.shift();h=s+u.shift();v=o+u.shift();i.curveTo(a,n,s,o,h,v)}h+=u.shift();v+=u.shift();i.lineTo(h,v);break;case 25:while(u.length>6){h+=u.shift();v+=u.shift();i.lineTo(h,v)}a=h+u.shift();n=v+u.shift();s=a+u.shift();o=n+u.shift();h=s+u.shift();v=o+u.shift();i.curveTo(a,n,s,o,h,v);break;case 26:u.length%2&&(h+=u.shift());while(u.length>0){a=h;n=v+u.shift();s=a+u.shift();o=n+u.shift();h=s;v=o+u.shift();i.curveTo(a,n,s,o,h,v)}break;case 27:u.length%2&&(v+=u.shift());while(u.length>0){a=h+u.shift();n=v;s=a+u.shift();o=n+u.shift();h=s+u.shift();v=o;i.curveTo(a,n,s,o,h,v)}break;case 28:g=r[O];y=r[O+1];u.push((g<<24|y<<16)>>16);O+=2;break;case 29:T=u.pop()+e.gsubrsBias;k=e.gsubrs[T];k&&parse(k);break;case 30:while(u.length>0){a=h;n=v+u.shift();s=a+u.shift();o=n+u.shift();h=s+u.shift();v=o+(1===u.length?u.shift():0);i.curveTo(a,n,s,o,h,v);if(0===u.length)break;a=h+u.shift();n=v;s=a+u.shift();o=n+u.shift();v=o+u.shift();h=s+(1===u.length?u.shift():0);i.curveTo(a,n,s,o,h,v)}break;case 31:while(u.length>0){a=h+u.shift();n=v;s=a+u.shift();o=n+u.shift();v=o+u.shift();h=s+(1===u.length?u.shift():0);i.curveTo(a,n,s,o,h,v);if(0===u.length)break;a=h;n=v+u.shift();s=a+u.shift();o=n+u.shift();h=s+u.shift();v=o+(1===u.length?u.shift():0);i.curveTo(a,n,s,o,h,v)}break;default:if(D<32)console.log("Glyph "+t.index+": unknown operator "+D);else if(D<247)u.push(D-139);else if(D<251){g=r[O];O+=1;u.push(256*(D-247)+g+108)}else if(D<255){g=r[O];O+=1;u.push(256*-(D-251)-g-108)}else{g=r[O];y=r[O+1];b=r[O+2];x=r[O+3];O+=4;u.push((g<<24|y<<16|b<<8|x)/65536)}}}}parse(r);t.advanceWidth=S;return i}function parseCFFFDSelect(e,t,r,a){var n=[];var s;var o=new U.Parser(e,t);var i=o.parseCard8();if(0===i)for(var u=0;u<r;u++){s=o.parseCard8();if(s>=a)throw new Error("CFF table CID Font FDSelect has bad FD index value "+s+" (FD count "+a+")");n.push(s)}else{if(3!==i)throw new Error("CFF Table CID Font FDSelect table has unsupported format "+i);var l=o.parseCard16();var p=o.parseCard16();if(0!==p)throw new Error("CFF Table CID Font FDSelect format 3 range has bad initial GID "+p);var c;for(var h=0;h<l;h++){s=o.parseCard8();c=o.parseCard16();if(s>=a)throw new Error("CFF table CID Font FDSelect has bad FD index value "+s+" (FD count "+a+")");if(c>r)throw new Error("CFF Table CID Font FDSelect format 3 range has bad GID "+c);for(;p<c;p++)n.push(s);p=c}if(c!==r)throw new Error("CFF Table CID Font FDSelect format 3 range has bad final GID "+c)}return n}function parseCFFTable(e,t,r,a){r.tables.cff={};var n=parseCFFHeader(e,t);var s=parseCFFIndex(e,n.endOffset,U.bytesToString);var o=parseCFFIndex(e,s.endOffset);var i=parseCFFIndex(e,o.endOffset,U.bytesToString);var u=parseCFFIndex(e,i.endOffset);r.gsubrs=u.objects;r.gsubrsBias=calcCFFSubroutineBias(r.gsubrs);var l=gatherCFFTopDicts(e,t,o.objects,i.objects);if(1!==l.length)throw new Error("CFF table has too many fonts in 'FontSet' - count of fonts NameIndex.length = "+l.length);var p=l[0];r.tables.cff.topDict=p;if(p._privateDict){r.defaultWidthX=p._privateDict.defaultWidthX;r.nominalWidthX=p._privateDict.nominalWidthX}void 0!==p.ros[0]&&void 0!==p.ros[1]&&(r.isCIDFont=true);if(r.isCIDFont){var c=p.fdArray;var h=p.fdSelect;if(0===c||0===h)throw new Error("Font is marked as a CID font, but FDArray and/or FDSelect information is missing");c+=t;var v=parseCFFIndex(e,c);var f=gatherCFFTopDicts(e,t,v.objects,i.objects);p._fdArray=f;h+=t;p._fdSelect=parseCFFFDSelect(e,h,r.numGlyphs,f.length)}var d=t+p.private[1];var g=parseCFFPrivateDict(e,d,p.private[0],i.objects);r.defaultWidthX=g.defaultWidthX;r.nominalWidthX=g.nominalWidthX;if(0!==g.subrs){var m=d+g.subrs;var y=parseCFFIndex(e,m);r.subrs=y.objects;r.subrsBias=calcCFFSubroutineBias(r.subrs)}else{r.subrs=[];r.subrsBias=0}var b;if(a.lowMemory){b=parseCFFIndexLowMemory(e,t+p.charStrings);r.nGlyphs=b.offsets.length}else{b=parseCFFIndex(e,t+p.charStrings);r.nGlyphs=b.objects.length}var S=parseCFFCharset(e,t+p.charset,r.nGlyphs,i.objects);0===p.encoding?r.cffEncoding=new CffEncoding(E,S):1===p.encoding?r.cffEncoding=new CffEncoding(O,S):r.cffEncoding=parseCFFEncoding(e,t+p.encoding,S);r.encoding=r.encoding||r.cffEncoding;r.glyphs=new w.GlyphSet(r);if(a.lowMemory)r._push=function(a){var n=getCffIndexObject(a,b.offsets,e,t+p.charStrings);r.glyphs.push(a,w.cffGlyphLoader(r,a,parseCFFCharstring,n))};else for(var x=0;x<r.nGlyphs;x+=1){var T=b.objects[x];r.glyphs.push(x,w.cffGlyphLoader(r,x,parseCFFCharstring,T))}}function encodeString(e,t){var r;var a=L.indexOf(e);a>=0&&(r=a);a=t.indexOf(e);if(a>=0)r=a+L.length;else{r=L.length+t.length;t.push(e)}return r}function makeHeader(){return new k.Record("Header",[{name:"major",type:"Card8",value:1},{name:"minor",type:"Card8",value:0},{name:"hdrSize",type:"Card8",value:4},{name:"major",type:"Card8",value:1}])}function makeNameIndex(e){var t=new k.Record("Name INDEX",[{name:"names",type:"INDEX",value:[]}]);t.names=[];for(var r=0;r<e.length;r+=1)t.names.push({name:"name_"+r,type:"NAME",value:e[r]});return t}function makeDict(e,t,r){var a={};for(var n=0;n<e.length;n+=1){var s=e[n];var o=t[s.name];if(void 0!==o&&!equals(o,s.value)){"SID"===s.type&&(o=encodeString(o,r));a[s.op]={name:s.name,type:s.type,value:o}}}return a}function makeTopDict(e,t){var r=new k.Record("Top DICT",[{name:"dict",type:"DICT",value:{}}]);r.dict=makeDict(I,e,t);return r}function makeTopDictIndex(e){var t=new k.Record("Top DICT INDEX",[{name:"topDicts",type:"INDEX",value:[]}]);t.topDicts=[{name:"topDict_0",type:"TABLE",value:e}];return t}function makeStringIndex(e){var t=new k.Record("String INDEX",[{name:"strings",type:"INDEX",value:[]}]);t.strings=[];for(var r=0;r<e.length;r+=1)t.strings.push({name:"string_"+r,type:"STRING",value:e[r]});return t}function makeGlobalSubrIndex(){return new k.Record("Global Subr INDEX",[{name:"subrs",type:"INDEX",value:[]}])}function makeCharsets(e,t){var r=new k.Record("Charsets",[{name:"format",type:"Card8",value:0}]);for(var a=0;a<e.length;a+=1){var n=e[a];var s=encodeString(n,t);r.fields.push({name:"glyph_"+a,type:"SID",value:s})}return r}function glyphToOps(e){var t=[];var r=e.path;t.push({name:"width",type:"NUMBER",value:e.advanceWidth});var a=0;var n=0;for(var s=0;s<r.commands.length;s+=1){var o=void 0;var i=void 0;var u=r.commands[s];if("Q"===u.type){var l=1/3;var p=2/3;u={type:"C",x:u.x,y:u.y,x1:Math.round(l*a+p*u.x1),y1:Math.round(l*n+p*u.y1),x2:Math.round(l*u.x+p*u.x1),y2:Math.round(l*u.y+p*u.y1)}}if("M"===u.type){o=Math.round(u.x-a);i=Math.round(u.y-n);t.push({name:"dx",type:"NUMBER",value:o});t.push({name:"dy",type:"NUMBER",value:i});t.push({name:"rmoveto",type:"OP",value:21});a=Math.round(u.x);n=Math.round(u.y)}else if("L"===u.type){o=Math.round(u.x-a);i=Math.round(u.y-n);t.push({name:"dx",type:"NUMBER",value:o});t.push({name:"dy",type:"NUMBER",value:i});t.push({name:"rlineto",type:"OP",value:5});a=Math.round(u.x);n=Math.round(u.y)}else if("C"===u.type){var c=Math.round(u.x1-a);var h=Math.round(u.y1-n);var v=Math.round(u.x2-u.x1);var f=Math.round(u.y2-u.y1);o=Math.round(u.x-u.x2);i=Math.round(u.y-u.y2);t.push({name:"dx1",type:"NUMBER",value:c});t.push({name:"dy1",type:"NUMBER",value:h});t.push({name:"dx2",type:"NUMBER",value:v});t.push({name:"dy2",type:"NUMBER",value:f});t.push({name:"dx",type:"NUMBER",value:o});t.push({name:"dy",type:"NUMBER",value:i});t.push({name:"rrcurveto",type:"OP",value:8});a=Math.round(u.x);n=Math.round(u.y)}}t.push({name:"endchar",type:"OP",value:14});return t}function makeCharStringsIndex(e){var t=new k.Record("CharStrings INDEX",[{name:"charStrings",type:"INDEX",value:[]}]);for(var r=0;r<e.length;r+=1){var a=e.get(r);var n=glyphToOps(a);t.charStrings.push({name:a.name,type:"CHARSTRING",value:n})}return t}function makePrivateDict(e,t){var r=new k.Record("Private DICT",[{name:"dict",type:"DICT",value:{}}]);r.dict=makeDict(M,e,t);return r}function makeCFFTable(e,t){var r=new k.Table("CFF ",[{name:"header",type:"RECORD"},{name:"nameIndex",type:"RECORD"},{name:"topDictIndex",type:"RECORD"},{name:"stringIndex",type:"RECORD"},{name:"globalSubrIndex",type:"RECORD"},{name:"charsets",type:"RECORD"},{name:"charStringsIndex",type:"RECORD"},{name:"privateDict",type:"RECORD"}]);var a=1/t.unitsPerEm;var n={version:t.version,fullName:t.fullName,familyName:t.familyName,weight:t.weightName,fontBBox:t.fontBBox||[0,0,0,0],fontMatrix:[a,0,0,a,0,0],charset:999,encoding:0,charStrings:999,private:[0,999]};var s={};var o=[];var i;for(var u=1;u<e.length;u+=1){i=e.get(u);o.push(i.name)}var l=[];r.header=makeHeader();r.nameIndex=makeNameIndex([t.postScriptName]);var p=makeTopDict(n,l);r.topDictIndex=makeTopDictIndex(p);r.globalSubrIndex=makeGlobalSubrIndex();r.charsets=makeCharsets(o,l);r.charStringsIndex=makeCharStringsIndex(e);r.privateDict=makePrivateDict(s,l);r.stringIndex=makeStringIndex(l);var c=r.header.sizeOf()+r.nameIndex.sizeOf()+r.topDictIndex.sizeOf()+r.stringIndex.sizeOf()+r.globalSubrIndex.sizeOf();n.charset=c;n.encoding=0;n.charStrings=n.charset+r.charsets.sizeOf();n.private[1]=n.charStrings+r.charStringsIndex.sizeOf();p=makeTopDict(n,l);r.topDictIndex=makeTopDictIndex(p);return r}var G={parse:parseCFFTable,make:makeCFFTable};function parseHeadTable(e,t){var r={};var a=new U.Parser(e,t);r.version=a.parseVersion();r.fontRevision=Math.round(1e3*a.parseFixed())/1e3;r.checkSumAdjustment=a.parseULong();r.magicNumber=a.parseULong();v.argument(1594834165===r.magicNumber,"Font header has wrong magic number.");r.flags=a.parseUShort();r.unitsPerEm=a.parseUShort();r.created=a.parseLongDateTime();r.modified=a.parseLongDateTime();r.xMin=a.parseShort();r.yMin=a.parseShort();r.xMax=a.parseShort();r.yMax=a.parseShort();r.macStyle=a.parseUShort();r.lowestRecPPEM=a.parseUShort();r.fontDirectionHint=a.parseShort();r.indexToLocFormat=a.parseShort();r.glyphDataFormat=a.parseShort();return r}function makeHeadTable(e){var t=Math.round((new Date).getTime()/1e3)+2082844800;var r=t;e.createdTimestamp&&(r=e.createdTimestamp+2082844800);return new k.Table("head",[{name:"version",type:"FIXED",value:65536},{name:"fontRevision",type:"FIXED",value:65536},{name:"checkSumAdjustment",type:"ULONG",value:0},{name:"magicNumber",type:"ULONG",value:1594834165},{name:"flags",type:"USHORT",value:0},{name:"unitsPerEm",type:"USHORT",value:1e3},{name:"created",type:"LONGDATETIME",value:r},{name:"modified",type:"LONGDATETIME",value:t},{name:"xMin",type:"SHORT",value:0},{name:"yMin",type:"SHORT",value:0},{name:"xMax",type:"SHORT",value:0},{name:"yMax",type:"SHORT",value:0},{name:"macStyle",type:"USHORT",value:0},{name:"lowestRecPPEM",type:"USHORT",value:0},{name:"fontDirectionHint",type:"SHORT",value:2},{name:"indexToLocFormat",type:"SHORT",value:0},{name:"glyphDataFormat",type:"SHORT",value:0}],e)}var A={parse:parseHeadTable,make:makeHeadTable};function parseHheaTable(e,t){var r={};var a=new U.Parser(e,t);r.version=a.parseVersion();r.ascender=a.parseShort();r.descender=a.parseShort();r.lineGap=a.parseShort();r.advanceWidthMax=a.parseUShort();r.minLeftSideBearing=a.parseShort();r.minRightSideBearing=a.parseShort();r.xMaxExtent=a.parseShort();r.caretSlopeRise=a.parseShort();r.caretSlopeRun=a.parseShort();r.caretOffset=a.parseShort();a.relativeOffset+=8;r.metricDataFormat=a.parseShort();r.numberOfHMetrics=a.parseUShort();return r}function makeHheaTable(e){return new k.Table("hhea",[{name:"version",type:"FIXED",value:65536},{name:"ascender",type:"FWORD",value:0},{name:"descender",type:"FWORD",value:0},{name:"lineGap",type:"FWORD",value:0},{name:"advanceWidthMax",type:"UFWORD",value:0},{name:"minLeftSideBearing",type:"FWORD",value:0},{name:"minRightSideBearing",type:"FWORD",value:0},{name:"xMaxExtent",type:"FWORD",value:0},{name:"caretSlopeRise",type:"SHORT",value:1},{name:"caretSlopeRun",type:"SHORT",value:0},{name:"caretOffset",type:"SHORT",value:0},{name:"reserved1",type:"SHORT",value:0},{name:"reserved2",type:"SHORT",value:0},{name:"reserved3",type:"SHORT",value:0},{name:"reserved4",type:"SHORT",value:0},{name:"metricDataFormat",type:"SHORT",value:0},{name:"numberOfHMetrics",type:"USHORT",value:0}],e)}var B={parse:parseHheaTable,make:makeHheaTable};function parseHmtxTableAll(e,t,r,a,n){var s;var o;var i=new U.Parser(e,t);for(var u=0;u<a;u+=1){if(u<r){s=i.parseUShort();o=i.parseShort()}var l=n.get(u);l.advanceWidth=s;l.leftSideBearing=o}}function parseHmtxTableOnLowMemory(e,t,r,a,n){e._hmtxTableData={};var s;var o;var i=new U.Parser(t,r);for(var u=0;u<n;u+=1){if(u<a){s=i.parseUShort();o=i.parseShort()}e._hmtxTableData[u]={advanceWidth:s,leftSideBearing:o}}}function parseHmtxTable(e,t,r,a,n,s,o){o.lowMemory?parseHmtxTableOnLowMemory(e,t,r,a,n):parseHmtxTableAll(t,r,a,n,s)}function makeHmtxTable(e){var t=new k.Table("hmtx",[]);for(var r=0;r<e.length;r+=1){var a=e.get(r);var n=a.advanceWidth||0;var s=a.leftSideBearing||0;t.fields.push({name:"advanceWidth_"+r,type:"USHORT",value:n});t.fields.push({name:"leftSideBearing_"+r,type:"SHORT",value:s})}return t}var N={parse:parseHmtxTable,make:makeHmtxTable};function makeLtagTable(e){var t=new k.Table("ltag",[{name:"version",type:"ULONG",value:1},{name:"flags",type:"ULONG",value:0},{name:"numTags",type:"ULONG",value:e.length}]);var r="";var a=12+4*e.length;for(var n=0;n<e.length;++n){var s=r.indexOf(e[n]);if(s<0){s=r.length;r+=e[n]}t.fields.push({name:"offset "+n,type:"USHORT",value:a+s});t.fields.push({name:"length "+n,type:"USHORT",value:e[n].length})}t.fields.push({name:"stringPool",type:"CHARARRAY",value:r});return t}function parseLtagTable(e,t){var r=new U.Parser(e,t);var a=r.parseULong();v.argument(1===a,"Unsupported ltag table version.");r.skip("uLong",1);var n=r.parseULong();var s=[];for(var o=0;o<n;o++){var i="";var u=t+r.parseUShort();var l=r.parseUShort();for(var p=u;p<u+l;++p)i+=String.fromCharCode(e.getInt8(p));s.push(i)}return s}var H={make:makeLtagTable,parse:parseLtagTable};function parseMaxpTable(e,t){var r={};var a=new U.Parser(e,t);r.version=a.parseVersion();r.numGlyphs=a.parseUShort();if(1===r.version){r.maxPoints=a.parseUShort();r.maxContours=a.parseUShort();r.maxCompositePoints=a.parseUShort();r.maxCompositeContours=a.parseUShort();r.maxZones=a.parseUShort();r.maxTwilightPoints=a.parseUShort();r.maxStorage=a.parseUShort();r.maxFunctionDefs=a.parseUShort();r.maxInstructionDefs=a.parseUShort();r.maxStackElements=a.parseUShort();r.maxSizeOfInstructions=a.parseUShort();r.maxComponentElements=a.parseUShort();r.maxComponentDepth=a.parseUShort()}return r}function makeMaxpTable(e){return new k.Table("maxp",[{name:"version",type:"FIXED",value:20480},{name:"numGlyphs",type:"USHORT",value:e}])}var _={parse:parseMaxpTable,make:makeMaxpTable};var z=["copyright","fontFamily","fontSubfamily","uniqueID","fullName","version","postScriptName","trademark","manufacturer","designer","description","manufacturerURL","designerURL","license","licenseURL","reserved","preferredFamily","preferredSubfamily","compatibleFullName","sampleText","postScriptFindFontName","wwsFamily","wwsSubfamily"];var W={0:"en",1:"fr",2:"de",3:"it",4:"nl",5:"sv",6:"es",7:"da",8:"pt",9:"no",10:"he",11:"ja",12:"ar",13:"fi",14:"el",15:"is",16:"mt",17:"tr",18:"hr",19:"zh-Hant",20:"ur",21:"hi",22:"th",23:"ko",24:"lt",25:"pl",26:"hu",27:"es",28:"lv",29:"se",30:"fo",31:"fa",32:"ru",33:"zh",34:"nl-BE",35:"ga",36:"sq",37:"ro",38:"cz",39:"sk",40:"si",41:"yi",42:"sr",43:"mk",44:"bg",45:"uk",46:"be",47:"uz",48:"kk",49:"az-Cyrl",50:"az-Arab",51:"hy",52:"ka",53:"mo",54:"ky",55:"tg",56:"tk",57:"mn-CN",58:"mn",59:"ps",60:"ks",61:"ku",62:"sd",63:"bo",64:"ne",65:"sa",66:"mr",67:"bn",68:"as",69:"gu",70:"pa",71:"or",72:"ml",73:"kn",74:"ta",75:"te",76:"si",77:"my",78:"km",79:"lo",80:"vi",81:"id",82:"tl",83:"ms",84:"ms-Arab",85:"am",86:"ti",87:"om",88:"so",89:"sw",90:"rw",91:"rn",92:"ny",93:"mg",94:"eo",128:"cy",129:"eu",130:"ca",131:"la",132:"qu",133:"gn",134:"ay",135:"tt",136:"ug",137:"dz",138:"jv",139:"su",140:"gl",141:"af",142:"br",143:"iu",144:"gd",145:"gv",146:"ga",147:"to",148:"el-polyton",149:"kl",150:"az",151:"nn"};var V={0:0,1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0,10:5,11:1,12:4,13:0,14:6,15:0,16:0,17:0,18:0,19:2,20:4,21:9,22:21,23:3,24:29,25:29,26:29,27:29,28:29,29:0,30:0,31:4,32:7,33:25,34:0,35:0,36:0,37:0,38:29,39:29,40:0,41:5,42:7,43:7,44:7,45:7,46:7,47:7,48:7,49:7,50:4,51:24,52:23,53:7,54:7,55:7,56:7,57:27,58:7,59:4,60:4,61:4,62:4,63:26,64:9,65:9,66:9,67:13,68:13,69:11,70:10,71:12,72:17,73:16,74:14,75:15,76:18,77:19,78:20,79:22,80:30,81:0,82:0,83:0,84:4,85:28,86:28,87:28,88:0,89:0,90:0,91:0,92:0,93:0,94:0,128:0,129:0,130:0,131:0,132:0,133:0,134:0,135:7,136:4,137:26,138:0,139:0,140:0,141:0,142:0,143:28,144:0,145:0,146:0,147:0,148:6,149:0,150:0,151:0};var q={1078:"af",1052:"sq",1156:"gsw",1118:"am",5121:"ar-DZ",15361:"ar-BH",3073:"ar",2049:"ar-IQ",11265:"ar-JO",13313:"ar-KW",12289:"ar-LB",4097:"ar-LY",6145:"ary",8193:"ar-OM",16385:"ar-QA",1025:"ar-SA",10241:"ar-SY",7169:"aeb",14337:"ar-AE",9217:"ar-YE",1067:"hy",1101:"as",2092:"az-Cyrl",1068:"az",1133:"ba",1069:"eu",1059:"be",2117:"bn",1093:"bn-IN",8218:"bs-Cyrl",5146:"bs",1150:"br",1026:"bg",1027:"ca",3076:"zh-HK",5124:"zh-MO",2052:"zh",4100:"zh-SG",1028:"zh-TW",1155:"co",1050:"hr",4122:"hr-BA",1029:"cs",1030:"da",1164:"prs",1125:"dv",2067:"nl-BE",1043:"nl",3081:"en-AU",10249:"en-BZ",4105:"en-CA",9225:"en-029",16393:"en-IN",6153:"en-IE",8201:"en-JM",17417:"en-MY",5129:"en-NZ",13321:"en-PH",18441:"en-SG",7177:"en-ZA",11273:"en-TT",2057:"en-GB",1033:"en",12297:"en-ZW",1061:"et",1080:"fo",1124:"fil",1035:"fi",2060:"fr-BE",3084:"fr-CA",1036:"fr",5132:"fr-LU",6156:"fr-MC",4108:"fr-CH",1122:"fy",1110:"gl",1079:"ka",3079:"de-AT",1031:"de",5127:"de-LI",4103:"de-LU",2055:"de-CH",1032:"el",1135:"kl",1095:"gu",1128:"ha",1037:"he",1081:"hi",1038:"hu",1039:"is",1136:"ig",1057:"id",1117:"iu",2141:"iu-Latn",2108:"ga",1076:"xh",1077:"zu",1040:"it",2064:"it-CH",1041:"ja",1099:"kn",1087:"kk",1107:"km",1158:"quc",1159:"rw",1089:"sw",1111:"kok",1042:"ko",1088:"ky",1108:"lo",1062:"lv",1063:"lt",2094:"dsb",1134:"lb",1071:"mk",2110:"ms-BN",1086:"ms",1100:"ml",1082:"mt",1153:"mi",1146:"arn",1102:"mr",1148:"moh",1104:"mn",2128:"mn-CN",1121:"ne",1044:"nb",2068:"nn",1154:"oc",1096:"or",1123:"ps",1045:"pl",1046:"pt",2070:"pt-PT",1094:"pa",1131:"qu-BO",2155:"qu-EC",3179:"qu",1048:"ro",1047:"rm",1049:"ru",9275:"smn",4155:"smj-NO",5179:"smj",3131:"se-FI",1083:"se",2107:"se-SE",8251:"sms",6203:"sma-NO",7227:"sms",1103:"sa",7194:"sr-Cyrl-BA",3098:"sr",6170:"sr-Latn-BA",2074:"sr-Latn",1132:"nso",1074:"tn",1115:"si",1051:"sk",1060:"sl",11274:"es-AR",16394:"es-BO",13322:"es-CL",9226:"es-CO",5130:"es-CR",7178:"es-DO",12298:"es-EC",17418:"es-SV",4106:"es-GT",18442:"es-HN",2058:"es-MX",19466:"es-NI",6154:"es-PA",15370:"es-PY",10250:"es-PE",20490:"es-PR",3082:"es",1034:"es",21514:"es-US",14346:"es-UY",8202:"es-VE",2077:"sv-FI",1053:"sv",1114:"syr",1064:"tg",2143:"tzm",1097:"ta",1092:"tt",1098:"te",1054:"th",1105:"bo",1055:"tr",1090:"tk",1152:"ug",1058:"uk",1070:"hsb",1056:"ur",2115:"uz-Cyrl",1091:"uz",1066:"vi",1106:"cy",1160:"wo",1157:"sah",1144:"ii",1130:"yo"};function getLanguageCode(e,t,r){switch(e){case 0:if(65535===t)return"und";if(r)return r[t];break;case 1:return W[t];case 3:return q[t]}}var X="utf-16";var Y={0:"macintosh",1:"x-mac-japanese",2:"x-mac-chinesetrad",3:"x-mac-korean",6:"x-mac-greek",7:"x-mac-cyrillic",9:"x-mac-devanagai",10:"x-mac-gurmukhi",11:"x-mac-gujarati",12:"x-mac-oriya",13:"x-mac-bengali",14:"x-mac-tamil",15:"x-mac-telugu",16:"x-mac-kannada",17:"x-mac-malayalam",18:"x-mac-sinhalese",19:"x-mac-burmese",20:"x-mac-khmer",21:"x-mac-thai",22:"x-mac-lao",23:"x-mac-georgian",24:"x-mac-armenian",25:"x-mac-chinesesimp",26:"x-mac-tibetan",27:"x-mac-mongolian",28:"x-mac-ethiopic",29:"x-mac-ce",30:"x-mac-vietnamese",31:"x-mac-extarabic"};var j={15:"x-mac-icelandic",17:"x-mac-turkish",18:"x-mac-croatian",24:"x-mac-ce",25:"x-mac-ce",26:"x-mac-ce",27:"x-mac-ce",28:"x-mac-ce",30:"x-mac-icelandic",37:"x-mac-romanian",38:"x-mac-ce",39:"x-mac-ce",40:"x-mac-ce",143:"x-mac-inuit",146:"x-mac-gaelic"};function getEncoding(e,t,r){switch(e){case 0:return X;case 1:return j[r]||Y[t];case 3:if(1===t||10===t)return X;break}}function parseNameTable(e,t,r){var a={};var n=new U.Parser(e,t);var s=n.parseUShort();var o=n.parseUShort();var i=n.offset+n.parseUShort();for(var u=0;u<o;u++){var l=n.parseUShort();var p=n.parseUShort();var c=n.parseUShort();var h=n.parseUShort();var v=z[h]||h;var f=n.parseUShort();var d=n.parseUShort();var m=getLanguageCode(l,c,r);var y=getEncoding(l,p,c);if(void 0!==y&&void 0!==m){var b=void 0;b=y===X?g.UTF16(e,i+d,f):g.MACSTRING(e,i+d,f,y);if(b){var S=a[v];void 0===S&&(S=a[v]={});S[m]=b}}}1===s&&n.parseUShort();return a}function reverseDict(e){var t={};for(var r in e)t[e[r]]=parseInt(r);return t}function makeNameRecord(e,t,r,a,n,s){return new k.Record("NameRecord",[{name:"platformID",type:"USHORT",value:e},{name:"encodingID",type:"USHORT",value:t},{name:"languageID",type:"USHORT",value:r},{name:"nameID",type:"USHORT",value:a},{name:"length",type:"USHORT",value:n},{name:"offset",type:"USHORT",value:s}])}function findSubArray(e,t){var r=e.length;var a=t.length-r+1;e:for(var n=0;n<a;n++)for(;n<a;n++){for(var s=0;s<r;s++)if(t[n+s]!==e[s])continue e;return n}return-1}function addStringToPool(e,t){var r=findSubArray(e,t);if(r<0){r=t.length;var a=0;var n=e.length;for(;a<n;++a)t.push(e[a])}return r}function makeNameTable(e,t){var r;var a=[];var n={};var s=reverseDict(z);for(var o in e){var i=s[o];void 0===i&&(i=o);r=parseInt(i);if(isNaN(r))throw new Error('Name table entry "'+o+'" does not exist, see nameTableNames for complete list.');n[r]=e[o];a.push(r)}var u=reverseDict(W);var l=reverseDict(q);var p=[];var c=[];for(var h=0;h<a.length;h++){r=a[h];var v=n[r];for(var f in v){var d=v[f];var g=1;var y=u[f];var b=V[y];var S=getEncoding(g,b,y);var x=m.MACSTRING(d,S);if(void 0===x){g=0;y=t.indexOf(f);if(y<0){y=t.length;t.push(f)}b=4;x=m.UTF16(d)}var T=addStringToPool(x,c);p.push(makeNameRecord(g,b,y,r,x.length,T));var P=l[f];if(void 0!==P){var R=m.UTF16(d);var U=addStringToPool(R,c);p.push(makeNameRecord(3,1,P,r,R.length,U))}}}p.sort((function(e,t){return e.platformID-t.platformID||e.encodingID-t.encodingID||e.languageID-t.languageID||e.nameID-t.nameID}));var C=new k.Table("name",[{name:"format",type:"USHORT",value:0},{name:"count",type:"USHORT",value:p.length},{name:"stringOffset",type:"USHORT",value:6+12*p.length}]);for(var L=0;L<p.length;L++)C.fields.push({name:"record_"+L,type:"RECORD",value:p[L]});C.fields.push({name:"strings",type:"LITERAL",value:c});return C}var Z={parse:parseNameTable,make:makeNameTable};var Q=[{begin:0,end:127},{begin:128,end:255},{begin:256,end:383},{begin:384,end:591},{begin:592,end:687},{begin:688,end:767},{begin:768,end:879},{begin:880,end:1023},{begin:11392,end:11519},{begin:1024,end:1279},{begin:1328,end:1423},{begin:1424,end:1535},{begin:42240,end:42559},{begin:1536,end:1791},{begin:1984,end:2047},{begin:2304,end:2431},{begin:2432,end:2559},{begin:2560,end:2687},{begin:2688,end:2815},{begin:2816,end:2943},{begin:2944,end:3071},{begin:3072,end:3199},{begin:3200,end:3327},{begin:3328,end:3455},{begin:3584,end:3711},{begin:3712,end:3839},{begin:4256,end:4351},{begin:6912,end:7039},{begin:4352,end:4607},{begin:7680,end:7935},{begin:7936,end:8191},{begin:8192,end:8303},{begin:8304,end:8351},{begin:8352,end:8399},{begin:8400,end:8447},{begin:8448,end:8527},{begin:8528,end:8591},{begin:8592,end:8703},{begin:8704,end:8959},{begin:8960,end:9215},{begin:9216,end:9279},{begin:9280,end:9311},{begin:9312,end:9471},{begin:9472,end:9599},{begin:9600,end:9631},{begin:9632,end:9727},{begin:9728,end:9983},{begin:9984,end:10175},{begin:12288,end:12351},{begin:12352,end:12447},{begin:12448,end:12543},{begin:12544,end:12591},{begin:12592,end:12687},{begin:43072,end:43135},{begin:12800,end:13055},{begin:13056,end:13311},{begin:44032,end:55215},{begin:55296,end:57343},{begin:67840,end:67871},{begin:19968,end:40959},{begin:57344,end:63743},{begin:12736,end:12783},{begin:64256,end:64335},{begin:64336,end:65023},{begin:65056,end:65071},{begin:65040,end:65055},{begin:65104,end:65135},{begin:65136,end:65279},{begin:65280,end:65519},{begin:65520,end:65535},{begin:3840,end:4095},{begin:1792,end:1871},{begin:1920,end:1983},{begin:3456,end:3583},{begin:4096,end:4255},{begin:4608,end:4991},{begin:5024,end:5119},{begin:5120,end:5759},{begin:5760,end:5791},{begin:5792,end:5887},{begin:6016,end:6143},{begin:6144,end:6319},{begin:10240,end:10495},{begin:40960,end:42127},{begin:5888,end:5919},{begin:66304,end:66351},{begin:66352,end:66383},{begin:66560,end:66639},{begin:118784,end:119039},{begin:119808,end:120831},{begin:1044480,end:1048573},{begin:65024,end:65039},{begin:917504,end:917631},{begin:6400,end:6479},{begin:6480,end:6527},{begin:6528,end:6623},{begin:6656,end:6687},{begin:11264,end:11359},{begin:11568,end:11647},{begin:19904,end:19967},{begin:43008,end:43055},{begin:65536,end:65663},{begin:65856,end:65935},{begin:66432,end:66463},{begin:66464,end:66527},{begin:66640,end:66687},{begin:66688,end:66735},{begin:67584,end:67647},{begin:68096,end:68191},{begin:119552,end:119647},{begin:73728,end:74751},{begin:119648,end:119679},{begin:7040,end:7103},{begin:7168,end:7247},{begin:7248,end:7295},{begin:43136,end:43231},{begin:43264,end:43311},{begin:43312,end:43359},{begin:43520,end:43615},{begin:65936,end:65999},{begin:66e3,end:66047},{begin:66208,end:66271},{begin:127024,end:127135}];function getUnicodeRange(e){for(var t=0;t<Q.length;t+=1){var r=Q[t];if(e>=r.begin&&e<r.end)return t}return-1}function parseOS2Table(e,t){var r={};var a=new U.Parser(e,t);r.version=a.parseUShort();r.xAvgCharWidth=a.parseShort();r.usWeightClass=a.parseUShort();r.usWidthClass=a.parseUShort();r.fsType=a.parseUShort();r.ySubscriptXSize=a.parseShort();r.ySubscriptYSize=a.parseShort();r.ySubscriptXOffset=a.parseShort();r.ySubscriptYOffset=a.parseShort();r.ySuperscriptXSize=a.parseShort();r.ySuperscriptYSize=a.parseShort();r.ySuperscriptXOffset=a.parseShort();r.ySuperscriptYOffset=a.parseShort();r.yStrikeoutSize=a.parseShort();r.yStrikeoutPosition=a.parseShort();r.sFamilyClass=a.parseShort();r.panose=[];for(var n=0;n<10;n++)r.panose[n]=a.parseByte();r.ulUnicodeRange1=a.parseULong();r.ulUnicodeRange2=a.parseULong();r.ulUnicodeRange3=a.parseULong();r.ulUnicodeRange4=a.parseULong();r.achVendID=String.fromCharCode(a.parseByte(),a.parseByte(),a.parseByte(),a.parseByte());r.fsSelection=a.parseUShort();r.usFirstCharIndex=a.parseUShort();r.usLastCharIndex=a.parseUShort();r.sTypoAscender=a.parseShort();r.sTypoDescender=a.parseShort();r.sTypoLineGap=a.parseShort();r.usWinAscent=a.parseUShort();r.usWinDescent=a.parseUShort();if(r.version>=1){r.ulCodePageRange1=a.parseULong();r.ulCodePageRange2=a.parseULong()}if(r.version>=2){r.sxHeight=a.parseShort();r.sCapHeight=a.parseShort();r.usDefaultChar=a.parseUShort();r.usBreakChar=a.parseUShort();r.usMaxContent=a.parseUShort()}return r}function makeOS2Table(e){return new k.Table("OS/2",[{name:"version",type:"USHORT",value:3},{name:"xAvgCharWidth",type:"SHORT",value:0},{name:"usWeightClass",type:"USHORT",value:0},{name:"usWidthClass",type:"USHORT",value:0},{name:"fsType",type:"USHORT",value:0},{name:"ySubscriptXSize",type:"SHORT",value:650},{name:"ySubscriptYSize",type:"SHORT",value:699},{name:"ySubscriptXOffset",type:"SHORT",value:0},{name:"ySubscriptYOffset",type:"SHORT",value:140},{name:"ySuperscriptXSize",type:"SHORT",value:650},{name:"ySuperscriptYSize",type:"SHORT",value:699},{name:"ySuperscriptXOffset",type:"SHORT",value:0},{name:"ySuperscriptYOffset",type:"SHORT",value:479},{name:"yStrikeoutSize",type:"SHORT",value:49},{name:"yStrikeoutPosition",type:"SHORT",value:258},{name:"sFamilyClass",type:"SHORT",value:0},{name:"bFamilyType",type:"BYTE",value:0},{name:"bSerifStyle",type:"BYTE",value:0},{name:"bWeight",type:"BYTE",value:0},{name:"bProportion",type:"BYTE",value:0},{name:"bContrast",type:"BYTE",value:0},{name:"bStrokeVariation",type:"BYTE",value:0},{name:"bArmStyle",type:"BYTE",value:0},{name:"bLetterform",type:"BYTE",value:0},{name:"bMidline",type:"BYTE",value:0},{name:"bXHeight",type:"BYTE",value:0},{name:"ulUnicodeRange1",type:"ULONG",value:0},{name:"ulUnicodeRange2",type:"ULONG",value:0},{name:"ulUnicodeRange3",type:"ULONG",value:0},{name:"ulUnicodeRange4",type:"ULONG",value:0},{name:"achVendID",type:"CHARARRAY",value:"XXXX"},{name:"fsSelection",type:"USHORT",value:0},{name:"usFirstCharIndex",type:"USHORT",value:0},{name:"usLastCharIndex",type:"USHORT",value:0},{name:"sTypoAscender",type:"SHORT",value:0},{name:"sTypoDescender",type:"SHORT",value:0},{name:"sTypoLineGap",type:"SHORT",value:0},{name:"usWinAscent",type:"USHORT",value:0},{name:"usWinDescent",type:"USHORT",value:0},{name:"ulCodePageRange1",type:"ULONG",value:0},{name:"ulCodePageRange2",type:"ULONG",value:0},{name:"sxHeight",type:"SHORT",value:0},{name:"sCapHeight",type:"SHORT",value:0},{name:"usDefaultChar",type:"USHORT",value:0},{name:"usBreakChar",type:"USHORT",value:0},{name:"usMaxContext",type:"USHORT",value:0}],e)}var K={parse:parseOS2Table,make:makeOS2Table,unicodeRanges:Q,getUnicodeRange:getUnicodeRange};function parsePostTable(e,t){var r={};var a=new U.Parser(e,t);r.version=a.parseVersion();r.italicAngle=a.parseFixed();r.underlinePosition=a.parseShort();r.underlineThickness=a.parseShort();r.isFixedPitch=a.parseULong();r.minMemType42=a.parseULong();r.maxMemType42=a.parseULong();r.minMemType1=a.parseULong();r.maxMemType1=a.parseULong();switch(r.version){case 1:r.names=D.slice();break;case 2:r.numberOfGlyphs=a.parseUShort();r.glyphNameIndex=new Array(r.numberOfGlyphs);for(var n=0;n<r.numberOfGlyphs;n++)r.glyphNameIndex[n]=a.parseUShort();r.names=[];for(var s=0;s<r.numberOfGlyphs;s++)if(r.glyphNameIndex[s]>=D.length){var o=a.parseChar();r.names.push(a.parseString(o))}break;case 2.5:r.numberOfGlyphs=a.parseUShort();r.offset=new Array(r.numberOfGlyphs);for(var i=0;i<r.numberOfGlyphs;i++)r.offset[i]=a.parseChar();break}return r}function makePostTable(){return new k.Table("post",[{name:"version",type:"FIXED",value:196608},{name:"italicAngle",type:"FIXED",value:0},{name:"underlinePosition",type:"FWORD",value:0},{name:"underlineThickness",type:"FWORD",value:0},{name:"isFixedPitch",type:"ULONG",value:0},{name:"minMemType42",type:"ULONG",value:0},{name:"maxMemType42",type:"ULONG",value:0},{name:"minMemType1",type:"ULONG",value:0},{name:"maxMemType1",type:"ULONG",value:0}])}var J={parse:parsePostTable,make:makePostTable};var $=new Array(9);$[1]=function parseLookup1(){var e=this.offset+this.relativeOffset;var t=this.parseUShort();if(1===t)return{substFormat:1,coverage:this.parsePointer(Parser.coverage),deltaGlyphId:this.parseUShort()};if(2===t)return{substFormat:2,coverage:this.parsePointer(Parser.coverage),substitute:this.parseOffset16List()};v.assert(false,"0x"+e.toString(16)+": lookup type 1 format must be 1 or 2.")};$[2]=function parseLookup2(){var e=this.parseUShort();v.argument(1===e,"GSUB Multiple Substitution Subtable identifier-format must be 1");return{substFormat:e,coverage:this.parsePointer(Parser.coverage),sequences:this.parseListOfLists()}};$[3]=function parseLookup3(){var e=this.parseUShort();v.argument(1===e,"GSUB Alternate Substitution Subtable identifier-format must be 1");return{substFormat:e,coverage:this.parsePointer(Parser.coverage),alternateSets:this.parseListOfLists()}};$[4]=function parseLookup4(){var e=this.parseUShort();v.argument(1===e,"GSUB ligature table identifier-format must be 1");return{substFormat:e,coverage:this.parsePointer(Parser.coverage),ligatureSets:this.parseListOfLists((function(){return{ligGlyph:this.parseUShort(),components:this.parseUShortList(this.parseUShort()-1)}}))}};var ee={sequenceIndex:Parser.uShort,lookupListIndex:Parser.uShort};$[5]=function parseLookup5(){var e=this.offset+this.relativeOffset;var t=this.parseUShort();if(1===t)return{substFormat:t,coverage:this.parsePointer(Parser.coverage),ruleSets:this.parseListOfLists((function(){var e=this.parseUShort();var t=this.parseUShort();return{input:this.parseUShortList(e-1),lookupRecords:this.parseRecordList(t,ee)}}))};if(2===t)return{substFormat:t,coverage:this.parsePointer(Parser.coverage),classDef:this.parsePointer(Parser.classDef),classSets:this.parseListOfLists((function(){var e=this.parseUShort();var t=this.parseUShort();return{classes:this.parseUShortList(e-1),lookupRecords:this.parseRecordList(t,ee)}}))};if(3===t){var r=this.parseUShort();var a=this.parseUShort();return{substFormat:t,coverages:this.parseList(r,Parser.pointer(Parser.coverage)),lookupRecords:this.parseRecordList(a,ee)}}v.assert(false,"0x"+e.toString(16)+": lookup type 5 format must be 1, 2 or 3.")};$[6]=function parseLookup6(){var e=this.offset+this.relativeOffset;var t=this.parseUShort();if(1===t)return{substFormat:1,coverage:this.parsePointer(Parser.coverage),chainRuleSets:this.parseListOfLists((function(){return{backtrack:this.parseUShortList(),input:this.parseUShortList(this.parseShort()-1),lookahead:this.parseUShortList(),lookupRecords:this.parseRecordList(ee)}}))};if(2===t)return{substFormat:2,coverage:this.parsePointer(Parser.coverage),backtrackClassDef:this.parsePointer(Parser.classDef),inputClassDef:this.parsePointer(Parser.classDef),lookaheadClassDef:this.parsePointer(Parser.classDef),chainClassSet:this.parseListOfLists((function(){return{backtrack:this.parseUShortList(),input:this.parseUShortList(this.parseShort()-1),lookahead:this.parseUShortList(),lookupRecords:this.parseRecordList(ee)}}))};if(3===t)return{substFormat:3,backtrackCoverage:this.parseList(Parser.pointer(Parser.coverage)),inputCoverage:this.parseList(Parser.pointer(Parser.coverage)),lookaheadCoverage:this.parseList(Parser.pointer(Parser.coverage)),lookupRecords:this.parseRecordList(ee)};v.assert(false,"0x"+e.toString(16)+": lookup type 6 format must be 1, 2 or 3.")};$[7]=function parseLookup7(){var e=this.parseUShort();v.argument(1===e,"GSUB Extension Substitution subtable identifier-format must be 1");var t=this.parseUShort();var r=new Parser(this.data,this.offset+this.parseULong());return{substFormat:1,lookupType:t,extension:$[t].call(r)}};$[8]=function parseLookup8(){var e=this.parseUShort();v.argument(1===e,"GSUB Reverse Chaining Contextual Single Substitution Subtable identifier-format must be 1");return{substFormat:e,coverage:this.parsePointer(Parser.coverage),backtrackCoverage:this.parseList(Parser.pointer(Parser.coverage)),lookaheadCoverage:this.parseList(Parser.pointer(Parser.coverage)),substitutes:this.parseUShortList()}};function parseGsubTable(e,t){t=t||0;var r=new Parser(e,t);var a=r.parseVersion(1);v.argument(1===a||1.1===a,"Unsupported GSUB table version.");return 1===a?{version:a,scripts:r.parseScriptList(),features:r.parseFeatureList(),lookups:r.parseLookupList($)}:{version:a,scripts:r.parseScriptList(),features:r.parseFeatureList(),lookups:r.parseLookupList($),variations:r.parseFeatureVariationsList()}}var te=new Array(9);te[1]=function makeLookup1(e){return 1===e.substFormat?new k.Table("substitutionTable",[{name:"substFormat",type:"USHORT",value:1},{name:"coverage",type:"TABLE",value:new k.Coverage(e.coverage)},{name:"deltaGlyphID",type:"USHORT",value:e.deltaGlyphId}]):new k.Table("substitutionTable",[{name:"substFormat",type:"USHORT",value:2},{name:"coverage",type:"TABLE",value:new k.Coverage(e.coverage)}].concat(k.ushortList("substitute",e.substitute)))};te[2]=function makeLookup2(e){v.assert(1===e.substFormat,"Lookup type 2 substFormat must be 1.");return new k.Table("substitutionTable",[{name:"substFormat",type:"USHORT",value:1},{name:"coverage",type:"TABLE",value:new k.Coverage(e.coverage)}].concat(k.tableList("seqSet",e.sequences,(function(e){return new k.Table("sequenceSetTable",k.ushortList("sequence",e))}))))};te[3]=function makeLookup3(e){v.assert(1===e.substFormat,"Lookup type 3 substFormat must be 1.");return new k.Table("substitutionTable",[{name:"substFormat",type:"USHORT",value:1},{name:"coverage",type:"TABLE",value:new k.Coverage(e.coverage)}].concat(k.tableList("altSet",e.alternateSets,(function(e){return new k.Table("alternateSetTable",k.ushortList("alternate",e))}))))};te[4]=function makeLookup4(e){v.assert(1===e.substFormat,"Lookup type 4 substFormat must be 1.");return new k.Table("substitutionTable",[{name:"substFormat",type:"USHORT",value:1},{name:"coverage",type:"TABLE",value:new k.Coverage(e.coverage)}].concat(k.tableList("ligSet",e.ligatureSets,(function(e){return new k.Table("ligatureSetTable",k.tableList("ligature",e,(function(e){return new k.Table("ligatureTable",[{name:"ligGlyph",type:"USHORT",value:e.ligGlyph}].concat(k.ushortList("component",e.components,e.components.length+1)))})))}))))};te[6]=function makeLookup6(e){if(1===e.substFormat){var t=new k.Table("chainContextTable",[{name:"substFormat",type:"USHORT",value:e.substFormat},{name:"coverage",type:"TABLE",value:new k.Coverage(e.coverage)}].concat(k.tableList("chainRuleSet",e.chainRuleSets,(function(e){return new k.Table("chainRuleSetTable",k.tableList("chainRule",e,(function(e){var t=k.ushortList("backtrackGlyph",e.backtrack,e.backtrack.length).concat(k.ushortList("inputGlyph",e.input,e.input.length+1)).concat(k.ushortList("lookaheadGlyph",e.lookahead,e.lookahead.length)).concat(k.ushortList("substitution",[],e.lookupRecords.length));e.lookupRecords.forEach((function(e,r){t=t.concat({name:"sequenceIndex"+r,type:"USHORT",value:e.sequenceIndex}).concat({name:"lookupListIndex"+r,type:"USHORT",value:e.lookupListIndex})}));return new k.Table("chainRuleTable",t)})))}))));return t}if(2===e.substFormat)v.assert(false,"lookup type 6 format 2 is not yet supported.");else if(3===e.substFormat){var r=[{name:"substFormat",type:"USHORT",value:e.substFormat}];r.push({name:"backtrackGlyphCount",type:"USHORT",value:e.backtrackCoverage.length});e.backtrackCoverage.forEach((function(e,t){r.push({name:"backtrackCoverage"+t,type:"TABLE",value:new k.Coverage(e)})}));r.push({name:"inputGlyphCount",type:"USHORT",value:e.inputCoverage.length});e.inputCoverage.forEach((function(e,t){r.push({name:"inputCoverage"+t,type:"TABLE",value:new k.Coverage(e)})}));r.push({name:"lookaheadGlyphCount",type:"USHORT",value:e.lookaheadCoverage.length});e.lookaheadCoverage.forEach((function(e,t){r.push({name:"lookaheadCoverage"+t,type:"TABLE",value:new k.Coverage(e)})}));r.push({name:"substitutionCount",type:"USHORT",value:e.lookupRecords.length});e.lookupRecords.forEach((function(e,t){r=r.concat({name:"sequenceIndex"+t,type:"USHORT",value:e.sequenceIndex}).concat({name:"lookupListIndex"+t,type:"USHORT",value:e.lookupListIndex})}));var a=new k.Table("chainContextTable",r);return a}v.assert(false,"lookup type 6 format must be 1, 2 or 3.")};function makeGsubTable(e){return new k.Table("GSUB",[{name:"version",type:"ULONG",value:65536},{name:"scripts",type:"TABLE",value:new k.ScriptList(e.scripts)},{name:"features",type:"TABLE",value:new k.FeatureList(e.features)},{name:"lookups",type:"TABLE",value:new k.LookupList(e.lookups,te)}])}var re={parse:parseGsubTable,make:makeGsubTable};function parseMetaTable(e,t){var r=new U.Parser(e,t);var a=r.parseULong();v.argument(1===a,"Unsupported META table version.");r.parseULong();r.parseULong();var n=r.parseULong();var s={};for(var o=0;o<n;o++){var i=r.parseTag();var u=r.parseULong();var l=r.parseULong();var p=g.UTF8(e,t+u,l);s[i]=p}return s}function makeMetaTable(e){var t=Object.keys(e).length;var r="";var a=16+12*t;var n=new k.Table("meta",[{name:"version",type:"ULONG",value:1},{name:"flags",type:"ULONG",value:0},{name:"offset",type:"ULONG",value:a},{name:"numTags",type:"ULONG",value:t}]);for(var s in e){var o=r.length;r+=e[s];n.fields.push({name:"tag "+s,type:"TAG",value:s});n.fields.push({name:"offset "+s,type:"ULONG",value:a+o});n.fields.push({name:"length "+s,type:"ULONG",value:e[s].length})}n.fields.push({name:"stringPool",type:"CHARARRAY",value:r});return n}var ae={parse:parseMetaTable,make:makeMetaTable};function log2(e){return Math.log(e)/Math.log(2)|0}function computeCheckSum(e){while(e.length%4!==0)e.push(0);var t=0;for(var r=0;r<e.length;r+=4)t+=(e[r]<<24)+(e[r+1]<<16)+(e[r+2]<<8)+e[r+3];t%=Math.pow(2,32);return t}function makeTableRecord(e,t,r,a){return new k.Record("Table Record",[{name:"tag",type:"TAG",value:void 0!==e?e:""},{name:"checkSum",type:"ULONG",value:void 0!==t?t:0},{name:"offset",type:"ULONG",value:void 0!==r?r:0},{name:"length",type:"ULONG",value:void 0!==a?a:0}])}function makeSfntTable(e){var t=new k.Table("sfnt",[{name:"version",type:"TAG",value:"OTTO"},{name:"numTables",type:"USHORT",value:0},{name:"searchRange",type:"USHORT",value:0},{name:"entrySelector",type:"USHORT",value:0},{name:"rangeShift",type:"USHORT",value:0}]);t.tables=e;t.numTables=e.length;var r=Math.pow(2,log2(t.numTables));t.searchRange=16*r;t.entrySelector=log2(r);t.rangeShift=16*t.numTables-t.searchRange;var a=[];var n=[];var s=t.sizeOf()+makeTableRecord().sizeOf()*t.numTables;while(s%4!==0){s+=1;n.push({name:"padding",type:"BYTE",value:0})}for(var o=0;o<e.length;o+=1){var i=e[o];v.argument(4===i.tableName.length,"Table name"+i.tableName+" is invalid.");var u=i.sizeOf();var l=makeTableRecord(i.tableName,computeCheckSum(i.encode()),s,u);a.push({name:l.tag+" Table Record",type:"RECORD",value:l});n.push({name:i.tableName+" table",type:"RECORD",value:i});s+=u;v.argument(!isNaN(s),"Something went wrong calculating the offset.");while(s%4!==0){s+=1;n.push({name:"padding",type:"BYTE",value:0})}}a.sort((function(e,t){return e.value.tag>t.value.tag?1:-1}));t.fields=t.fields.concat(a);t.fields=t.fields.concat(n);return t}function metricsForChar(e,t,r){for(var a=0;a<t.length;a+=1){var n=e.charToGlyphIndex(t[a]);if(n>0){var s=e.glyphs.get(n);return s.getMetrics()}}return r}function average(e){var t=0;for(var r=0;r<e.length;r+=1)t+=e[r];return t/e.length}function fontToSfntTable(e){var t=[];var r=[];var a=[];var n=[];var s=[];var o=[];var i=[];var u;var l=0;var p=0;var c=0;var h=0;var v=0;for(var f=0;f<e.glyphs.length;f+=1){var d=e.glyphs.get(f);var g=0|d.unicode;if(isNaN(d.advanceWidth))throw new Error("Glyph "+d.name+" ("+f+"): advanceWidth is not a number.");(u>g||void 0===u)&&g>0&&(u=g);l<g&&(l=g);var m=K.getUnicodeRange(g);if(m<32)p|=1<<m;else if(m<64)c|=1<<m-32;else if(m<96)h|=1<<m-64;else{if(!(m<123))throw new Error("Unicode ranges bits > 123 are reserved for internal usage");v|=1<<m-96}if(".notdef"!==d.name){var y=d.getMetrics();t.push(y.xMin);r.push(y.yMin);a.push(y.xMax);n.push(y.yMax);o.push(y.leftSideBearing);i.push(y.rightSideBearing);s.push(d.advanceWidth)}}var b={xMin:Math.min.apply(null,t),yMin:Math.min.apply(null,r),xMax:Math.max.apply(null,a),yMax:Math.max.apply(null,n),advanceWidthMax:Math.max.apply(null,s),advanceWidthAvg:average(s),minLeftSideBearing:Math.min.apply(null,o),maxLeftSideBearing:Math.max.apply(null,o),minRightSideBearing:Math.min.apply(null,i)};b.ascender=e.ascender;b.descender=e.descender;var S=A.make({flags:3,unitsPerEm:e.unitsPerEm,xMin:b.xMin,yMin:b.yMin,xMax:b.xMax,yMax:b.yMax,lowestRecPPEM:3,createdTimestamp:e.createdTimestamp});var x=B.make({ascender:b.ascender,descender:b.descender,advanceWidthMax:b.advanceWidthMax,minLeftSideBearing:b.minLeftSideBearing,minRightSideBearing:b.minRightSideBearing,xMaxExtent:b.maxLeftSideBearing+(b.xMax-b.xMin),numberOfHMetrics:e.glyphs.length});var T=_.make(e.glyphs.length);var k=K.make(Object.assign({xAvgCharWidth:Math.round(b.advanceWidthAvg),usFirstCharIndex:u,usLastCharIndex:l,ulUnicodeRange1:p,ulUnicodeRange2:c,ulUnicodeRange3:h,ulUnicodeRange4:v,sTypoAscender:b.ascender,sTypoDescender:b.descender,sTypoLineGap:0,usWinAscent:b.yMax,usWinDescent:Math.abs(b.yMin),ulCodePageRange1:1,sxHeight:metricsForChar(e,"xyvw",{yMax:Math.round(b.ascender/2)}).yMax,sCapHeight:metricsForChar(e,"HIKLEFJMNTZBDPRAGOQSUVWXY",b).yMax,usDefaultChar:e.hasChar(" ")?32:0,usBreakChar:e.hasChar(" ")?32:0},e.tables.os2));var P=N.make(e.glyphs);var R=C.make(e.glyphs);var U=e.getEnglishName("fontFamily");var L=e.getEnglishName("fontSubfamily");var E=U+" "+L;var O=e.getEnglishName("postScriptName");O||(O=U.replace(/\s/g,"")+"-"+L);var D={};for(var F in e.names)D[F]=e.names[F];D.uniqueID||(D.uniqueID={en:e.getEnglishName("manufacturer")+":"+E});D.postScriptName||(D.postScriptName={en:O});D.preferredFamily||(D.preferredFamily=e.names.fontFamily);D.preferredSubfamily||(D.preferredSubfamily=e.names.fontSubfamily);var w=[];var I=Z.make(D,w);var M=w.length>0?H.make(w):void 0;var z=J.make();var W=G.make(e.glyphs,{version:e.getEnglishName("version"),fullName:E,familyName:U,weightName:L,postScriptName:O,unitsPerEm:e.unitsPerEm,fontBBox:[0,b.yMin,b.ascender,b.advanceWidthMax]});var V=e.metas&&Object.keys(e.metas).length>0?ae.make(e.metas):void 0;var q=[S,x,T,k,I,R,z,W,P];M&&q.push(M);e.tables.gsub&&q.push(re.make(e.tables.gsub));V&&q.push(V);var X=makeSfntTable(q);var Y=X.encode();var j=computeCheckSum(Y);var Q=X.fields;var $=false;for(var ee=0;ee<Q.length;ee+=1)if("head table"===Q[ee].name){Q[ee].value.checkSumAdjustment=2981146554-j;$=true;break}if(!$)throw new Error("Could not find head table with checkSum to adjust.");return X}var ne={make:makeSfntTable,fontToTable:fontToSfntTable,computeCheckSum:computeCheckSum};function searchTag(e,t){var r=0;var a=e.length-1;while(r<=a){var n=r+a>>>1;var s=e[n].tag;if(s===t)return n;s<t?r=n+1:a=n-1}return-r-1}function binSearch(e,t){var r=0;var a=e.length-1;while(r<=a){var n=r+a>>>1;var s=e[n];if(s===t)return n;s<t?r=n+1:a=n-1}return-r-1}function searchRange(e,t){var r;var a=0;var n=e.length-1;while(a<=n){var s=a+n>>>1;r=e[s];var o=r.start;if(o===t)return r;o<t?a=s+1:n=s-1}if(a>0){r=e[a-1];return t>r.end?0:r}}function Layout(e,t){this.font=e;this.tableName=t}Layout.prototype={
/**
     * Binary search an object by "tag" property
     * @instance
     * @function searchTag
     * @memberof opentype.Layout
     * @param  {Array} arr
     * @param  {string} tag
     * @return {number}
     */
searchTag:searchTag,
/**
     * Binary search in a list of numbers
     * @instance
     * @function binSearch
     * @memberof opentype.Layout
     * @param  {Array} arr
     * @param  {number} value
     * @return {number}
     */
binSearch:binSearch,
/**
     * Get or create the Layout table (GSUB, GPOS etc).
     * @param  {boolean} create - Whether to create a new one.
     * @return {Object} The GSUB or GPOS table.
     */
getTable:function(e){var t=this.font.tables[this.tableName];!t&&e&&(t=this.font.tables[this.tableName]=this.createDefaultTable());return t},getScriptNames:function(){var e=this.getTable();return e?e.scripts.map((function(e){return e.tag})):[]},getDefaultScriptName:function(){var e=this.getTable();if(e){var t=false;for(var r=0;r<e.scripts.length;r++){var a=e.scripts[r].tag;if("DFLT"===a)return a;"latn"===a&&(t=true)}return t?"latn":void 0}},
/**
     * Returns all LangSysRecords in the given script.
     * @instance
     * @param {string} [script='DFLT']
     * @param {boolean} create - forces the creation of this script table if it doesn't exist.
     * @return {Object} An object with tag and script properties.
     */
getScriptTable:function(e,t){var r=this.getTable(t);if(r){e=e||"DFLT";var a=r.scripts;var n=searchTag(r.scripts,e);if(n>=0)return a[n].script;if(t){var s={tag:e,script:{defaultLangSys:{reserved:0,reqFeatureIndex:65535,featureIndexes:[]},langSysRecords:[]}};a.splice(-1-n,0,s);return s.script}}},
/**
     * Returns a language system table
     * @instance
     * @param {string} [script='DFLT']
     * @param {string} [language='dlft']
     * @param {boolean} create - forces the creation of this langSysTable if it doesn't exist.
     * @return {Object}
     */
getLangSysTable:function(e,t,r){var a=this.getScriptTable(e,r);if(a){if(!t||"dflt"===t||"DFLT"===t)return a.defaultLangSys;var n=searchTag(a.langSysRecords,t);if(n>=0)return a.langSysRecords[n].langSys;if(r){var s={tag:t,langSys:{reserved:0,reqFeatureIndex:65535,featureIndexes:[]}};a.langSysRecords.splice(-1-n,0,s);return s.langSys}}},
/**
     * Get a specific feature table.
     * @instance
     * @param {string} [script='DFLT']
     * @param {string} [language='dlft']
     * @param {string} feature - One of the codes listed at https://www.microsoft.com/typography/OTSPEC/featurelist.htm
     * @param {boolean} create - forces the creation of the feature table if it doesn't exist.
     * @return {Object}
     */
getFeatureTable:function(e,t,r,a){var n=this.getLangSysTable(e,t,a);if(n){var s;var o=n.featureIndexes;var i=this.font.tables[this.tableName].features;for(var u=0;u<o.length;u++){s=i[o[u]];if(s.tag===r)return s.feature}if(a){var l=i.length;v.assert(0===l||r>=i[l-1].tag,"Features must be added in alphabetical order.");s={tag:r,feature:{params:0,lookupListIndexes:[]}};i.push(s);o.push(l);return s.feature}}},
/**
     * Get the lookup tables of a given type for a script/language/feature.
     * @instance
     * @param {string} [script='DFLT']
     * @param {string} [language='dlft']
     * @param {string} feature - 4-letter feature code
     * @param {number} lookupType - 1 to 9
     * @param {boolean} create - forces the creation of the lookup table if it doesn't exist, with no subtables.
     * @return {Object[]}
     */
getLookupTables:function(e,t,r,a,n){var s=this.getFeatureTable(e,t,r,n);var o=[];if(s){var i;var u=s.lookupListIndexes;var l=this.font.tables[this.tableName].lookups;for(var p=0;p<u.length;p++){i=l[u[p]];i.lookupType===a&&o.push(i)}if(0===o.length&&n){i={lookupType:a,lookupFlag:0,subtables:[],markFilteringSet:void 0};var c=l.length;l.push(i);u.push(c);return[i]}}return o},
/**
     * Find a glyph in a class definition table
     * https://docs.microsoft.com/en-us/typography/opentype/spec/chapter2#class-definition-table
     * @param {object} classDefTable - an OpenType Layout class definition table
     * @param {number} glyphIndex - the index of the glyph to find
     * @returns {number} -1 if not found
     */
getGlyphClass:function(e,t){switch(e.format){case 1:return e.startGlyph<=t&&t<e.startGlyph+e.classes.length?e.classes[t-e.startGlyph]:0;case 2:var r=searchRange(e.ranges,t);return r?r.classId:0}},
/**
     * Find a glyph in a coverage table
     * https://docs.microsoft.com/en-us/typography/opentype/spec/chapter2#coverage-table
     * @param {object} coverageTable - an OpenType Layout coverage table
     * @param {number} glyphIndex - the index of the glyph to find
     * @returns {number} -1 if not found
     */
getCoverageIndex:function(e,t){switch(e.format){case 1:var r=binSearch(e.glyphs,t);return r>=0?r:-1;case 2:var a=searchRange(e.ranges,t);return a?a.index+t-a.start:-1}},
/**
     * Returns the list of glyph indexes of a coverage table.
     * Format 1: the list is stored raw
     * Format 2: compact list as range records.
     * @instance
     * @param  {Object} coverageTable
     * @return {Array}
     */
expandCoverage:function(e){if(1===e.format)return e.glyphs;var t=[];var r=e.ranges;for(var a=0;a<r.length;a++){var n=r[a];var s=n.start;var o=n.end;for(var i=s;i<=o;i++)t.push(i)}return t}};
/**
 * @exports opentype.Position
 * @class
 * @extends opentype.Layout
 * @param {opentype.Font}
 * @constructor
 */function Position(e){Layout.call(this,e,"gpos")}Position.prototype=Layout.prototype;Position.prototype.init=function(){var e=this.getDefaultScriptName();this.defaultKerningTables=this.getKerningTables(e)};
/**
 * Find a glyph pair in a list of lookup tables of type 2 and retrieve the xAdvance kerning value.
 *
 * @param {integer} leftIndex - left glyph index
 * @param {integer} rightIndex - right glyph index
 * @returns {integer}
 */Position.prototype.getKerningValue=function(e,t,r){for(var a=0;a<e.length;a++){var n=e[a].subtables;for(var s=0;s<n.length;s++){var o=n[s];var i=this.getCoverageIndex(o.coverage,t);if(!(i<0))switch(o.posFormat){case 1:var u=o.pairSets[i];for(var l=0;l<u.length;l++){var p=u[l];if(p.secondGlyph===r)return p.value1&&p.value1.xAdvance||0}break;case 2:var c=this.getGlyphClass(o.classDef1,t);var h=this.getGlyphClass(o.classDef2,r);var v=o.classRecords[c][h];return v.value1&&v.value1.xAdvance||0}}}return 0};
/**
 * List all kerning lookup tables.
 *
 * @param {string} [script='DFLT'] - use font.position.getDefaultScriptName() for a better default value
 * @param {string} [language='dflt']
 * @return {object[]} The list of kerning lookup tables (may be empty), or undefined if there is no GPOS table (and we should use the kern table)
 */Position.prototype.getKerningTables=function(e,t){if(this.font.tables.gpos)return this.getLookupTables(e,t,"kern",2)};
/**
 * @exports opentype.Substitution
 * @class
 * @extends opentype.Layout
 * @param {opentype.Font}
 * @constructor
 */function Substitution(e){Layout.call(this,e,"gsub")}function arraysEqual(e,t){var r=e.length;if(r!==t.length)return false;for(var a=0;a<r;a++)if(e[a]!==t[a])return false;return true}function getSubstFormat(e,t,r){var a=e.subtables;for(var n=0;n<a.length;n++){var s=a[n];if(s.substFormat===t)return s}if(r){a.push(r);return r}}Substitution.prototype=Layout.prototype;Substitution.prototype.createDefaultTable=function(){return{version:1,scripts:[{tag:"DFLT",script:{defaultLangSys:{reserved:0,reqFeatureIndex:65535,featureIndexes:[]},langSysRecords:[]}}],features:[],lookups:[]}};
/**
 * List all single substitutions (lookup type 1) for a given script, language, and feature.
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @param {string} feature - 4-character feature name ('aalt', 'salt', 'ss01'...)
 * @return {Array} substitutions - The list of substitutions.
 */Substitution.prototype.getSingle=function(e,t,r){var a=[];var n=this.getLookupTables(t,r,e,1);for(var s=0;s<n.length;s++){var o=n[s].subtables;for(var i=0;i<o.length;i++){var u=o[i];var l=this.expandCoverage(u.coverage);var p=void 0;if(1===u.substFormat){var c=u.deltaGlyphId;for(p=0;p<l.length;p++){var h=l[p];a.push({sub:h,by:h+c})}}else{var v=u.substitute;for(p=0;p<l.length;p++)a.push({sub:l[p],by:v[p]})}}}return a};
/**
 * List all multiple substitutions (lookup type 2) for a given script, language, and feature.
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @param {string} feature - 4-character feature name ('ccmp', 'stch')
 * @return {Array} substitutions - The list of substitutions.
 */Substitution.prototype.getMultiple=function(e,t,r){var a=[];var n=this.getLookupTables(t,r,e,2);for(var s=0;s<n.length;s++){var o=n[s].subtables;for(var i=0;i<o.length;i++){var u=o[i];var l=this.expandCoverage(u.coverage);var p=void 0;for(p=0;p<l.length;p++){var c=l[p];var h=u.sequences[p];a.push({sub:c,by:h})}}}return a};
/**
 * List all alternates (lookup type 3) for a given script, language, and feature.
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @param {string} feature - 4-character feature name ('aalt', 'salt'...)
 * @return {Array} alternates - The list of alternates
 */Substitution.prototype.getAlternates=function(e,t,r){var a=[];var n=this.getLookupTables(t,r,e,3);for(var s=0;s<n.length;s++){var o=n[s].subtables;for(var i=0;i<o.length;i++){var u=o[i];var l=this.expandCoverage(u.coverage);var p=u.alternateSets;for(var c=0;c<l.length;c++)a.push({sub:l[c],by:p[c]})}}return a};
/**
 * List all ligatures (lookup type 4) for a given script, language, and feature.
 * The result is an array of ligature objects like { sub: [ids], by: id }
 * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @return {Array} ligatures - The list of ligatures.
 */Substitution.prototype.getLigatures=function(e,t,r){var a=[];var n=this.getLookupTables(t,r,e,4);for(var s=0;s<n.length;s++){var o=n[s].subtables;for(var i=0;i<o.length;i++){var u=o[i];var l=this.expandCoverage(u.coverage);var p=u.ligatureSets;for(var c=0;c<l.length;c++){var h=l[c];var v=p[c];for(var f=0;f<v.length;f++){var d=v[f];a.push({sub:[h].concat(d.components),by:d.ligGlyph})}}}}return a};
/**
 * Add or modify a single substitution (lookup type 1)
 * Format 2, more flexible, is always used.
 * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
 * @param {Object} substitution - { sub: id, by: id } (format 1 is not supported)
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */Substitution.prototype.addSingle=function(e,t,r,a){var n=this.getLookupTables(r,a,e,1,true)[0];var s=getSubstFormat(n,2,{substFormat:2,coverage:{format:1,glyphs:[]},substitute:[]});v.assert(1===s.coverage.format,"Single: unable to modify coverage table format "+s.coverage.format);var o=t.sub;var i=this.binSearch(s.coverage.glyphs,o);if(i<0){i=-1-i;s.coverage.glyphs.splice(i,0,o);s.substitute.splice(i,0,0)}s.substitute[i]=t.by};
/**
 * Add or modify a multiple substitution (lookup type 2)
 * @param {string} feature - 4-letter feature name ('ccmp', 'stch')
 * @param {Object} substitution - { sub: id, by: [id] } for format 2.
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */Substitution.prototype.addMultiple=function(e,t,r,a){v.assert(t.by instanceof Array&&t.by.length>1,'Multiple: "by" must be an array of two or more ids');var n=this.getLookupTables(r,a,e,2,true)[0];var s=getSubstFormat(n,1,{substFormat:1,coverage:{format:1,glyphs:[]},sequences:[]});v.assert(1===s.coverage.format,"Multiple: unable to modify coverage table format "+s.coverage.format);var o=t.sub;var i=this.binSearch(s.coverage.glyphs,o);if(i<0){i=-1-i;s.coverage.glyphs.splice(i,0,o);s.sequences.splice(i,0,0)}s.sequences[i]=t.by};
/**
 * Add or modify an alternate substitution (lookup type 3)
 * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
 * @param {Object} substitution - { sub: id, by: [ids] }
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */Substitution.prototype.addAlternate=function(e,t,r,a){var n=this.getLookupTables(r,a,e,3,true)[0];var s=getSubstFormat(n,1,{substFormat:1,coverage:{format:1,glyphs:[]},alternateSets:[]});v.assert(1===s.coverage.format,"Alternate: unable to modify coverage table format "+s.coverage.format);var o=t.sub;var i=this.binSearch(s.coverage.glyphs,o);if(i<0){i=-1-i;s.coverage.glyphs.splice(i,0,o);s.alternateSets.splice(i,0,0)}s.alternateSets[i]=t.by};
/**
 * Add a ligature (lookup type 4)
 * Ligatures with more components must be stored ahead of those with fewer components in order to be found
 * @param {string} feature - 4-letter feature name ('liga', 'rlig', 'dlig'...)
 * @param {Object} ligature - { sub: [ids], by: id }
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */Substitution.prototype.addLigature=function(e,t,r,a){var n=this.getLookupTables(r,a,e,4,true)[0];var s=n.subtables[0];if(!s){s={substFormat:1,coverage:{format:1,glyphs:[]},ligatureSets:[]};n.subtables[0]=s}v.assert(1===s.coverage.format,"Ligature: unable to modify coverage table format "+s.coverage.format);var o=t.sub[0];var i=t.sub.slice(1);var u={ligGlyph:t.by,components:i};var l=this.binSearch(s.coverage.glyphs,o);if(l>=0){var p=s.ligatureSets[l];for(var c=0;c<p.length;c++)if(arraysEqual(p[c].components,i))return;p.push(u)}else{l=-1-l;s.coverage.glyphs.splice(l,0,o);s.ligatureSets.splice(l,0,[u])}};
/**
 * List all feature data for a given script and language.
 * @param {string} feature - 4-letter feature name
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 * @return {Array} substitutions - The list of substitutions.
 */Substitution.prototype.getFeature=function(e,t,r){if(/ss\d\d/.test(e))return this.getSingle(e,t,r);switch(e){case"aalt":case"salt":return this.getSingle(e,t,r).concat(this.getAlternates(e,t,r));case"dlig":case"liga":case"rlig":return this.getLigatures(e,t,r);case"ccmp":return this.getMultiple(e,t,r).concat(this.getLigatures(e,t,r));case"stch":return this.getMultiple(e,t,r)}};
/**
 * Add a substitution to a feature for a given script and language.
 * @param {string} feature - 4-letter feature name
 * @param {Object} sub - the substitution to add (an object like { sub: id or [ids], by: id or [ids] })
 * @param {string} [script='DFLT']
 * @param {string} [language='dflt']
 */Substitution.prototype.add=function(e,t,r,a){if(/ss\d\d/.test(e))return this.addSingle(e,t,r,a);switch(e){case"aalt":case"salt":return"number"===typeof t.by?this.addSingle(e,t,r,a):this.addAlternate(e,t,r,a);case"dlig":case"liga":case"rlig":return this.addLigature(e,t,r,a);case"ccmp":return t.by instanceof Array?this.addMultiple(e,t,r,a):this.addLigature(e,t,r,a)}};function isBrowser(){return"undefined"!==typeof window}function nodeBufferToArrayBuffer(e){var t=new ArrayBuffer(e.length);var r=new Uint8Array(t);for(var a=0;a<e.length;++a)r[a]=e[a];return t}function arrayBufferToNodeBuffer(e){var t=new Buffer(e.byteLength);var r=new Uint8Array(e);for(var a=0;a<t.length;++a)t[a]=r[a];return t}function checkArgument(e,t){if(!e)throw t}function parseGlyphCoordinate(e,t,r,a,n){var s;if((t&a)>0){s=e.parseByte();0===(t&n)&&(s=-s);s=r+s}else s=(t&n)>0?r:r+e.parseShort();return s}function parseGlyph(e,t,r){var a=new U.Parser(t,r);e.numberOfContours=a.parseShort();e._xMin=a.parseShort();e._yMin=a.parseShort();e._xMax=a.parseShort();e._yMax=a.parseShort();var n;var s;if(e.numberOfContours>0){var o=e.endPointIndices=[];for(var i=0;i<e.numberOfContours;i+=1)o.push(a.parseUShort());e.instructionLength=a.parseUShort();e.instructions=[];for(var u=0;u<e.instructionLength;u+=1)e.instructions.push(a.parseByte());var l=o[o.length-1]+1;n=[];for(var p=0;p<l;p+=1){s=a.parseByte();n.push(s);if((8&s)>0){var c=a.parseByte();for(var h=0;h<c;h+=1){n.push(s);p+=1}}}v.argument(n.length===l,"Bad flags.");if(o.length>0){var f=[];var d;if(l>0){for(var g=0;g<l;g+=1){s=n[g];d={};d.onCurve=!!(1&s);d.lastPointOfContour=o.indexOf(g)>=0;f.push(d)}var m=0;for(var y=0;y<l;y+=1){s=n[y];d=f[y];d.x=parseGlyphCoordinate(a,s,m,2,16);m=d.x}var b=0;for(var S=0;S<l;S+=1){s=n[S];d=f[S];d.y=parseGlyphCoordinate(a,s,b,4,32);b=d.y}}e.points=f}else e.points=[]}else if(0===e.numberOfContours)e.points=[];else{e.isComposite=true;e.points=[];e.components=[];var x=true;while(x){n=a.parseUShort();var T={glyphIndex:a.parseUShort(),xScale:1,scale01:0,scale10:0,yScale:1,dx:0,dy:0};if((1&n)>0)if((2&n)>0){T.dx=a.parseShort();T.dy=a.parseShort()}else T.matchedPoints=[a.parseUShort(),a.parseUShort()];else if((2&n)>0){T.dx=a.parseChar();T.dy=a.parseChar()}else T.matchedPoints=[a.parseByte(),a.parseByte()];if((8&n)>0)T.xScale=T.yScale=a.parseF2Dot14();else if((64&n)>0){T.xScale=a.parseF2Dot14();T.yScale=a.parseF2Dot14()}else if((128&n)>0){T.xScale=a.parseF2Dot14();T.scale01=a.parseF2Dot14();T.scale10=a.parseF2Dot14();T.yScale=a.parseF2Dot14()}e.components.push(T);x=!!(32&n)}if(256&n){e.instructionLength=a.parseUShort();e.instructions=[];for(var k=0;k<e.instructionLength;k+=1)e.instructions.push(a.parseByte())}}}function transformPoints(e,t){var r=[];for(var a=0;a<e.length;a+=1){var n=e[a];var s={x:t.xScale*n.x+t.scale01*n.y+t.dx,y:t.scale10*n.x+t.yScale*n.y+t.dy,onCurve:n.onCurve,lastPointOfContour:n.lastPointOfContour};r.push(s)}return r}function getContours(e){var t=[];var r=[];for(var a=0;a<e.length;a+=1){var n=e[a];r.push(n);if(n.lastPointOfContour){t.push(r);r=[]}}v.argument(0===r.length,"There are still points left in the current contour.");return t}function getPath(e){var t=new Path;if(!e)return t;var r=getContours(e);for(var a=0;a<r.length;++a){var n=r[a];var s=null;var o=n[n.length-1];var i=n[0];if(o.onCurve)t.moveTo(o.x,o.y);else if(i.onCurve)t.moveTo(i.x,i.y);else{var u={x:.5*(o.x+i.x),y:.5*(o.y+i.y)};t.moveTo(u.x,u.y)}for(var l=0;l<n.length;++l){s=o;o=i;i=n[(l+1)%n.length];if(o.onCurve)t.lineTo(o.x,o.y);else{var p=i;s.onCurve||{x:.5*(o.x+s.x),y:.5*(o.y+s.y)};i.onCurve||(p={x:.5*(o.x+i.x),y:.5*(o.y+i.y)});t.quadraticCurveTo(o.x,o.y,p.x,p.y)}}t.closePath()}return t}function buildPath(e,t){if(t.isComposite)for(var r=0;r<t.components.length;r+=1){var a=t.components[r];var n=e.get(a.glyphIndex);n.getPath();if(n.points){var s=void 0;if(void 0===a.matchedPoints)s=transformPoints(n.points,a);else{if(a.matchedPoints[0]>t.points.length-1||a.matchedPoints[1]>n.points.length-1)throw Error("Matched points out of range in "+t.name);var o=t.points[a.matchedPoints[0]];var i=n.points[a.matchedPoints[1]];var u={xScale:a.xScale,scale01:a.scale01,scale10:a.scale10,yScale:a.yScale,dx:0,dy:0};i=transformPoints([i],u)[0];u.dx=o.x-i.x;u.dy=o.y-i.y;s=transformPoints(n.points,u)}t.points=t.points.concat(s)}}return getPath(t.points)}function parseGlyfTableAll(e,t,r,a){var n=new w.GlyphSet(a);for(var s=0;s<r.length-1;s+=1){var o=r[s];var i=r[s+1];o!==i?n.push(s,w.ttfGlyphLoader(a,s,parseGlyph,e,t+o,buildPath)):n.push(s,w.glyphLoader(a,s))}return n}function parseGlyfTableOnLowMemory(e,t,r,a){var n=new w.GlyphSet(a);a._push=function(s){var o=r[s];var i=r[s+1];o!==i?n.push(s,w.ttfGlyphLoader(a,s,parseGlyph,e,t+o,buildPath)):n.push(s,w.glyphLoader(a,s))};return n}function parseGlyfTable(e,t,r,a,n){return n.lowMemory?parseGlyfTableOnLowMemory(e,t,r,a):parseGlyfTableAll(e,t,r,a)}var se={getPath:getPath,parse:parseGlyfTable};var oe;var ie;var ue;var le;function Hinting(e){this.font=e;this.getCommands=function(e){return se.getPath(e).commands};this._fpgmState=this._prepState=void 0;this._errorState=0}function roundOff(e){return e}function roundToGrid(e){return Math.sign(e)*Math.round(Math.abs(e))}function roundToDoubleGrid(e){return Math.sign(e)*Math.round(Math.abs(2*e))/2}function roundToHalfGrid(e){return Math.sign(e)*(Math.round(Math.abs(e)+.5)-.5)}function roundUpToGrid(e){return Math.sign(e)*Math.ceil(Math.abs(e))}function roundDownToGrid(e){return Math.sign(e)*Math.floor(Math.abs(e))}var roundSuper=function(e){var t=this.srPeriod;var r=this.srPhase;var a=this.srThreshold;var n=1;if(e<0){e=-e;n=-1}e+=a-r;e=Math.trunc(e/t)*t;e+=r;return e<0?r*n:e*n};var pe={x:1,y:0,axis:"x",distance:function(e,t,r,a){return(r?e.xo:e.x)-(a?t.xo:t.x)},interpolate:function(e,t,r,a){var n;var s;var o;var i;var u;var l;var p;if(a&&a!==this){n=a.distance(e,t,true,true);s=a.distance(e,r,true,true);u=a.distance(t,t,false,true);l=a.distance(r,r,false,true);o=Math.abs(n);i=Math.abs(s);p=o+i;0!==p?pe.setRelative(e,e,(u*i+l*o)/p,a,true):pe.setRelative(e,e,(u+l)/2,a,true)}else{n=e.xo-t.xo;s=e.xo-r.xo;u=t.x-t.xo;l=r.x-r.xo;o=Math.abs(n);i=Math.abs(s);p=o+i;if(0===p){e.x=e.xo+(u+l)/2;return}e.x=e.xo+(u*i+l*o)/p}},normalSlope:Number.NEGATIVE_INFINITY,setRelative:function(e,t,r,a,n){if(a&&a!==this){var s=n?t.xo:t.x;var o=n?t.yo:t.y;var i=s+r*a.x;var u=o+r*a.y;e.x=i+(e.y-u)/a.normalSlope}else e.x=(n?t.xo:t.x)+r},slope:0,touch:function(e){e.xTouched=true},touched:function(e){return e.xTouched},untouch:function(e){e.xTouched=false}};var ce={x:0,y:1,axis:"y",distance:function(e,t,r,a){return(r?e.yo:e.y)-(a?t.yo:t.y)},interpolate:function(e,t,r,a){var n;var s;var o;var i;var u;var l;var p;if(a&&a!==this){n=a.distance(e,t,true,true);s=a.distance(e,r,true,true);u=a.distance(t,t,false,true);l=a.distance(r,r,false,true);o=Math.abs(n);i=Math.abs(s);p=o+i;0!==p?ce.setRelative(e,e,(u*i+l*o)/p,a,true):ce.setRelative(e,e,(u+l)/2,a,true)}else{n=e.yo-t.yo;s=e.yo-r.yo;u=t.y-t.yo;l=r.y-r.yo;o=Math.abs(n);i=Math.abs(s);p=o+i;if(0===p){e.y=e.yo+(u+l)/2;return}e.y=e.yo+(u*i+l*o)/p}},normalSlope:0,setRelative:function(e,t,r,a,n){if(a&&a!==this){var s=n?t.xo:t.x;var o=n?t.yo:t.y;var i=s+r*a.x;var u=o+r*a.y;e.y=u+a.normalSlope*(e.x-i)}else e.y=(n?t.yo:t.y)+r},slope:Number.POSITIVE_INFINITY,touch:function(e){e.yTouched=true},touched:function(e){return e.yTouched},untouch:function(e){e.yTouched=false}};Object.freeze(pe);Object.freeze(ce);function UnitVector(e,t){this.x=e;this.y=t;this.axis=void 0;this.slope=t/e;this.normalSlope=-e/t;Object.freeze(this)}UnitVector.prototype.distance=function(e,t,r,a){return this.x*pe.distance(e,t,r,a)+this.y*ce.distance(e,t,r,a)};UnitVector.prototype.interpolate=function(e,t,r,a){var n;var s;var o;var i;var u;var l;var p;o=a.distance(e,t,true,true);i=a.distance(e,r,true,true);n=a.distance(t,t,false,true);s=a.distance(r,r,false,true);u=Math.abs(o);l=Math.abs(i);p=u+l;0!==p?this.setRelative(e,e,(n*l+s*u)/p,a,true):this.setRelative(e,e,(n+s)/2,a,true)};UnitVector.prototype.setRelative=function(e,t,r,a,n){a=a||this;var s=n?t.xo:t.x;var o=n?t.yo:t.y;var i=s+r*a.x;var u=o+r*a.y;var l=a.normalSlope;var p=this.slope;var c=e.x;var h=e.y;e.x=(p*c-l*i+u-h)/(p-l);e.y=p*(e.x-c)+h};UnitVector.prototype.touch=function(e){e.xTouched=true;e.yTouched=true};function getUnitVector(e,t){var r=Math.sqrt(e*e+t*t);e/=r;t/=r;return 1===e&&0===t?pe:0===e&&1===t?ce:new UnitVector(e,t)}function HPoint(e,t,r,a){this.x=this.xo=Math.round(64*e)/64;this.y=this.yo=Math.round(64*t)/64;this.lastPointOfContour=r;this.onCurve=a;this.prevPointOnContour=void 0;this.nextPointOnContour=void 0;this.xTouched=false;this.yTouched=false;Object.preventExtensions(this)}HPoint.prototype.nextTouched=function(e){var t=this.nextPointOnContour;while(!e.touched(t)&&t!==this)t=t.nextPointOnContour;return t};HPoint.prototype.prevTouched=function(e){var t=this.prevPointOnContour;while(!e.touched(t)&&t!==this)t=t.prevPointOnContour;return t};var he=Object.freeze(new HPoint(0,0));var ve={cvCutIn:17/16,deltaBase:9,deltaShift:.125,loop:1,minDis:1,autoFlip:true};function State(e,t){this.env=e;this.stack=[];this.prog=t;switch(e){case"glyf":this.zp0=this.zp1=this.zp2=1;this.rp0=this.rp1=this.rp2=0;case"prep":this.fv=this.pv=this.dpv=pe;this.round=roundToGrid}}Hinting.prototype.exec=function(e,t){if("number"!==typeof t)throw new Error("Point size is not a number!");if(!(this._errorState>2)){var r=this.font;var a=this._prepState;if(!a||a.ppem!==t){var n=this._fpgmState;if(!n){State.prototype=ve;n=this._fpgmState=new State("fpgm",r.tables.fpgm);n.funcs=[];n.font=r;if(exports.DEBUG){console.log("---EXEC FPGM---");n.step=-1}try{ie(n)}catch(e){console.log("Hinting error in FPGM:"+e);this._errorState=3;return}}State.prototype=n;a=this._prepState=new State("prep",r.tables.prep);a.ppem=t;var s=r.tables.cvt;if(s){var o=a.cvt=new Array(s.length);var i=t/r.unitsPerEm;for(var u=0;u<s.length;u++)o[u]=s[u]*i}else a.cvt=[];if(exports.DEBUG){console.log("---EXEC PREP---");a.step=-1}try{ie(a)}catch(e){this._errorState<2&&console.log("Hinting error in PREP:"+e);this._errorState=2}}if(!(this._errorState>1))try{return ue(e,a)}catch(e){if(this._errorState<1){console.log("Hinting error:"+e);console.log("Note: further hinting errors are silenced")}this._errorState=1;return}}};ue=function(e,t){var r=t.ppem/t.font.unitsPerEm;var a=r;var n=e.components;var s;var o;var i;State.prototype=t;if(n){var u=t.font;o=[];s=[];for(var l=0;l<n.length;l++){var p=n[l];var c=u.glyphs.get(p.glyphIndex);i=new State("glyf",c.instructions);if(exports.DEBUG){console.log("---EXEC COMP "+l+"---");i.step=-1}le(c,i,r,a);var h=Math.round(p.dx*r);var v=Math.round(p.dy*a);var f=i.gZone;var d=i.contours;for(var g=0;g<f.length;g++){var m=f[g];m.xTouched=m.yTouched=false;m.xo=m.x=m.x+h;m.yo=m.y=m.y+v}var y=o.length;o.push.apply(o,f);for(var b=0;b<d.length;b++)s.push(d[b]+y)}if(e.instructions&&!i.inhibitGridFit){i=new State("glyf",e.instructions);i.gZone=i.z0=i.z1=i.z2=o;i.contours=s;o.push(new HPoint(0,0),new HPoint(Math.round(e.advanceWidth*r),0));if(exports.DEBUG){console.log("---EXEC COMPOSITE---");i.step=-1}ie(i);o.length-=2}}else{i=new State("glyf",e.instructions);if(exports.DEBUG){console.log("---EXEC GLYPH---");i.step=-1}le(e,i,r,a);o=i.gZone}return o};le=function(e,t,r,a){var n=e.points||[];var s=n.length;var o=t.gZone=t.z0=t.z1=t.z2=[];var i=t.contours=[];var u;for(var l=0;l<s;l++){u=n[l];o[l]=new HPoint(u.x*r,u.y*a,u.lastPointOfContour,u.onCurve)}var p;var c;for(var h=0;h<s;h++){u=o[h];if(!p){p=u;i.push(h)}if(u.lastPointOfContour){u.nextPointOnContour=p;p.prevPointOnContour=u;p=void 0}else{c=o[h+1];u.nextPointOnContour=c;c.prevPointOnContour=u}}if(!t.inhibitGridFit){if(exports.DEBUG){console.log("PROCESSING GLYPH",t.stack);for(var v=0;v<s;v++)console.log(v,o[v].x,o[v].y)}o.push(new HPoint(0,0),new HPoint(Math.round(e.advanceWidth*r),0));ie(t);o.length-=2;if(exports.DEBUG){console.log("FINISHED GLYPH",t.stack);for(var f=0;f<s;f++)console.log(f,o[f].x,o[f].y)}}};ie=function(e){var t=e.prog;if(t){var r=t.length;var a;for(e.ip=0;e.ip<r;e.ip++){exports.DEBUG&&e.step++;a=oe[t[e.ip]];if(!a)throw new Error("unknown instruction: 0x"+Number(t[e.ip]).toString(16));a(e)}}};function initTZone(e){var t=e.tZone=new Array(e.gZone.length);for(var r=0;r<t.length;r++)t[r]=new HPoint(0,0)}function skip(e,t){var r=e.prog;var a=e.ip;var n=1;var s;do{s=r[++a];if(88===s)n++;else if(89===s)n--;else if(64===s)a+=r[a+1]+1;else if(65===s)a+=2*r[a+1]+1;else if(s>=176&&s<=183)a+=s-176+1;else if(s>=184&&s<=191)a+=2*(s-184+1);else if(t&&1===n&&27===s)break}while(n>0);e.ip=a}function SVTCA(e,t){exports.DEBUG&&console.log(t.step,"SVTCA["+e.axis+"]");t.fv=t.pv=t.dpv=e}function SPVTCA(e,t){exports.DEBUG&&console.log(t.step,"SPVTCA["+e.axis+"]");t.pv=t.dpv=e}function SFVTCA(e,t){exports.DEBUG&&console.log(t.step,"SFVTCA["+e.axis+"]");t.fv=e}function SPVTL(e,t){var r=t.stack;var a=r.pop();var n=r.pop();var s=t.z2[a];var o=t.z1[n];exports.DEBUG&&console.log("SPVTL["+e+"]",a,n);var i;var u;if(e){i=s.y-o.y;u=o.x-s.x}else{i=o.x-s.x;u=o.y-s.y}t.pv=t.dpv=getUnitVector(i,u)}function SFVTL(e,t){var r=t.stack;var a=r.pop();var n=r.pop();var s=t.z2[a];var o=t.z1[n];exports.DEBUG&&console.log("SFVTL["+e+"]",a,n);var i;var u;if(e){i=s.y-o.y;u=o.x-s.x}else{i=o.x-s.x;u=o.y-s.y}t.fv=getUnitVector(i,u)}function SPVFS(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"SPVFS[]",r,a);e.pv=e.dpv=getUnitVector(a,r)}function SFVFS(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"SPVFS[]",r,a);e.fv=getUnitVector(a,r)}function GPV(e){var t=e.stack;var r=e.pv;exports.DEBUG&&console.log(e.step,"GPV[]");t.push(16384*r.x);t.push(16384*r.y)}function GFV(e){var t=e.stack;var r=e.fv;exports.DEBUG&&console.log(e.step,"GFV[]");t.push(16384*r.x);t.push(16384*r.y)}function SFVTPV(e){e.fv=e.pv;exports.DEBUG&&console.log(e.step,"SFVTPV[]")}function ISECT(e){var t=e.stack;var r=t.pop();var a=t.pop();var n=t.pop();var s=t.pop();var o=t.pop();var i=e.z0;var u=e.z1;var l=i[r];var p=i[a];var c=u[n];var h=u[s];var v=e.z2[o];exports.DEBUG&&console.log("ISECT[], ",r,a,n,s,o);var f=l.x;var d=l.y;var g=p.x;var m=p.y;var y=c.x;var b=c.y;var S=h.x;var x=h.y;var T=(f-g)*(b-x)-(d-m)*(y-S);var k=f*m-d*g;var P=y*x-b*S;v.x=(k*(y-S)-P*(f-g))/T;v.y=(k*(b-x)-P*(d-m))/T}function SRP0(e){e.rp0=e.stack.pop();exports.DEBUG&&console.log(e.step,"SRP0[]",e.rp0)}function SRP1(e){e.rp1=e.stack.pop();exports.DEBUG&&console.log(e.step,"SRP1[]",e.rp1)}function SRP2(e){e.rp2=e.stack.pop();exports.DEBUG&&console.log(e.step,"SRP2[]",e.rp2)}function SZP0(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"SZP0[]",t);e.zp0=t;switch(t){case 0:e.tZone||initTZone(e);e.z0=e.tZone;break;case 1:e.z0=e.gZone;break;default:throw new Error("Invalid zone pointer")}}function SZP1(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"SZP1[]",t);e.zp1=t;switch(t){case 0:e.tZone||initTZone(e);e.z1=e.tZone;break;case 1:e.z1=e.gZone;break;default:throw new Error("Invalid zone pointer")}}function SZP2(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"SZP2[]",t);e.zp2=t;switch(t){case 0:e.tZone||initTZone(e);e.z2=e.tZone;break;case 1:e.z2=e.gZone;break;default:throw new Error("Invalid zone pointer")}}function SZPS(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"SZPS[]",t);e.zp0=e.zp1=e.zp2=t;switch(t){case 0:e.tZone||initTZone(e);e.z0=e.z1=e.z2=e.tZone;break;case 1:e.z0=e.z1=e.z2=e.gZone;break;default:throw new Error("Invalid zone pointer")}}function SLOOP(e){e.loop=e.stack.pop();exports.DEBUG&&console.log(e.step,"SLOOP[]",e.loop)}function RTG(e){exports.DEBUG&&console.log(e.step,"RTG[]");e.round=roundToGrid}function RTHG(e){exports.DEBUG&&console.log(e.step,"RTHG[]");e.round=roundToHalfGrid}function SMD(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"SMD[]",t);e.minDis=t/64}function ELSE(e){exports.DEBUG&&console.log(e.step,"ELSE[]");skip(e,false)}function JMPR(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"JMPR[]",t);e.ip+=t-1}function SCVTCI(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"SCVTCI[]",t);e.cvCutIn=t/64}function DUP(e){var t=e.stack;exports.DEBUG&&console.log(e.step,"DUP[]");t.push(t[t.length-1])}function POP(e){exports.DEBUG&&console.log(e.step,"POP[]");e.stack.pop()}function CLEAR(e){exports.DEBUG&&console.log(e.step,"CLEAR[]");e.stack.length=0}function SWAP(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"SWAP[]");t.push(r);t.push(a)}function DEPTH(e){var t=e.stack;exports.DEBUG&&console.log(e.step,"DEPTH[]");t.push(t.length)}function LOOPCALL(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"LOOPCALL[]",r,a);var n=e.ip;var s=e.prog;e.prog=e.funcs[r];for(var o=0;o<a;o++){ie(e);exports.DEBUG&&console.log(++e.step,o+1<a?"next loopcall":"done loopcall",o)}e.ip=n;e.prog=s}function CALL(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"CALL[]",t);var r=e.ip;var a=e.prog;e.prog=e.funcs[t];ie(e);e.ip=r;e.prog=a;exports.DEBUG&&console.log(++e.step,"returning from",t)}function CINDEX(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"CINDEX[]",r);t.push(t[t.length-r])}function MINDEX(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"MINDEX[]",r);t.push(t.splice(t.length-r,1)[0])}function FDEF(e){if("fpgm"!==e.env)throw new Error("FDEF not allowed here");var t=e.stack;var r=e.prog;var a=e.ip;var n=t.pop();var s=a;exports.DEBUG&&console.log(e.step,"FDEF[]",n);while(45!==r[++a]);e.ip=a;e.funcs[n]=r.slice(s+1,a)}function MDAP(e,t){var r=t.stack.pop();var a=t.z0[r];var n=t.fv;var s=t.pv;exports.DEBUG&&console.log(t.step,"MDAP["+e+"]",r);var o=s.distance(a,he);e&&(o=t.round(o));n.setRelative(a,he,o,s);n.touch(a);t.rp0=t.rp1=r}function IUP(e,t){var r=t.z2;var a=r.length-2;var n;var s;var o;exports.DEBUG&&console.log(t.step,"IUP["+e.axis+"]");for(var i=0;i<a;i++){n=r[i];if(!e.touched(n)){s=n.prevTouched(e);if(s!==n){o=n.nextTouched(e);s===o&&e.setRelative(n,n,e.distance(s,s,false,true),e,true);e.interpolate(n,s,o,e)}}}}function SHP(e,t){var r=t.stack;var a=e?t.rp1:t.rp2;var n=(e?t.z0:t.z1)[a];var s=t.fv;var o=t.pv;var i=t.loop;var u=t.z2;while(i--){var l=r.pop();var p=u[l];var c=o.distance(n,n,false,true);s.setRelative(p,p,c,o);s.touch(p);exports.DEBUG&&console.log(t.step,(t.loop>1?"loop "+(t.loop-i)+": ":"")+"SHP["+(e?"rp1":"rp2")+"]",l)}t.loop=1}function SHC(e,t){var r=t.stack;var a=e?t.rp1:t.rp2;var n=(e?t.z0:t.z1)[a];var s=t.fv;var o=t.pv;var i=r.pop();var u=t.z2[t.contours[i]];var l=u;exports.DEBUG&&console.log(t.step,"SHC["+e+"]",i);var p=o.distance(n,n,false,true);do{l!==n&&s.setRelative(l,l,p,o);l=l.nextPointOnContour}while(l!==u)}function SHZ(e,t){var r=t.stack;var a=e?t.rp1:t.rp2;var n=(e?t.z0:t.z1)[a];var s=t.fv;var o=t.pv;var i=r.pop();exports.DEBUG&&console.log(t.step,"SHZ["+e+"]",i);var u;switch(i){case 0:u=t.tZone;break;case 1:u=t.gZone;break;default:throw new Error("Invalid zone")}var l;var p=o.distance(n,n,false,true);var c=u.length-2;for(var h=0;h<c;h++){l=u[h];s.setRelative(l,l,p,o)}}function SHPIX(e){var t=e.stack;var r=e.loop;var a=e.fv;var n=t.pop()/64;var s=e.z2;while(r--){var o=t.pop();var i=s[o];exports.DEBUG&&console.log(e.step,(e.loop>1?"loop "+(e.loop-r)+": ":"")+"SHPIX[]",o,n);a.setRelative(i,i,n);a.touch(i)}e.loop=1}function IP(e){var t=e.stack;var r=e.rp1;var a=e.rp2;var n=e.loop;var s=e.z0[r];var o=e.z1[a];var i=e.fv;var u=e.dpv;var l=e.z2;while(n--){var p=t.pop();var c=l[p];exports.DEBUG&&console.log(e.step,(e.loop>1?"loop "+(e.loop-n)+": ":"")+"IP[]",p,r,"<->",a);i.interpolate(c,s,o,u);i.touch(c)}e.loop=1}function MSIRP(e,t){var r=t.stack;var a=r.pop()/64;var n=r.pop();var s=t.z1[n];var o=t.z0[t.rp0];var i=t.fv;var u=t.pv;i.setRelative(s,o,a,u);i.touch(s);exports.DEBUG&&console.log(t.step,"MSIRP["+e+"]",a,n);t.rp1=t.rp0;t.rp2=n;e&&(t.rp0=n)}function ALIGNRP(e){var t=e.stack;var r=e.rp0;var a=e.z0[r];var n=e.loop;var s=e.fv;var o=e.pv;var i=e.z1;while(n--){var u=t.pop();var l=i[u];exports.DEBUG&&console.log(e.step,(e.loop>1?"loop "+(e.loop-n)+": ":"")+"ALIGNRP[]",u);s.setRelative(l,a,0,o);s.touch(l)}e.loop=1}function RTDG(e){exports.DEBUG&&console.log(e.step,"RTDG[]");e.round=roundToDoubleGrid}function MIAP(e,t){var r=t.stack;var a=r.pop();var n=r.pop();var s=t.z0[n];var o=t.fv;var i=t.pv;var u=t.cvt[a];exports.DEBUG&&console.log(t.step,"MIAP["+e+"]",a,"(",u,")",n);var l=i.distance(s,he);if(e){Math.abs(l-u)<t.cvCutIn&&(l=u);l=t.round(l)}o.setRelative(s,he,l,i);if(0===t.zp0){s.xo=s.x;s.yo=s.y}o.touch(s);t.rp0=t.rp1=n}function NPUSHB(e){var t=e.prog;var r=e.ip;var a=e.stack;var n=t[++r];exports.DEBUG&&console.log(e.step,"NPUSHB[]",n);for(var s=0;s<n;s++)a.push(t[++r]);e.ip=r}function NPUSHW(e){var t=e.ip;var r=e.prog;var a=e.stack;var n=r[++t];exports.DEBUG&&console.log(e.step,"NPUSHW[]",n);for(var s=0;s<n;s++){var o=r[++t]<<8|r[++t];32768&o&&(o=-(1+(65535^o)));a.push(o)}e.ip=t}function WS(e){var t=e.stack;var r=e.store;r||(r=e.store=[]);var a=t.pop();var n=t.pop();exports.DEBUG&&console.log(e.step,"WS",a,n);r[n]=a}function RS(e){var t=e.stack;var r=e.store;var a=t.pop();exports.DEBUG&&console.log(e.step,"RS",a);var n=r&&r[a]||0;t.push(n)}function WCVTP(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"WCVTP",r,a);e.cvt[a]=r/64}function RCVT(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"RCVT",r);t.push(64*e.cvt[r])}function GC(e,t){var r=t.stack;var a=r.pop();var n=t.z2[a];exports.DEBUG&&console.log(t.step,"GC["+e+"]",a);r.push(64*t.dpv.distance(n,he,e,false))}function MD(e,t){var r=t.stack;var a=r.pop();var n=r.pop();var s=t.z1[a];var o=t.z0[n];var i=t.dpv.distance(o,s,e,e);exports.DEBUG&&console.log(t.step,"MD["+e+"]",a,n,"->",i);t.stack.push(Math.round(64*i))}function MPPEM(e){exports.DEBUG&&console.log(e.step,"MPPEM[]");e.stack.push(e.ppem)}function FLIPON(e){exports.DEBUG&&console.log(e.step,"FLIPON[]");e.autoFlip=true}function LT(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"LT[]",r,a);t.push(a<r?1:0)}function LTEQ(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"LTEQ[]",r,a);t.push(a<=r?1:0)}function GT(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"GT[]",r,a);t.push(a>r?1:0)}function GTEQ(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"GTEQ[]",r,a);t.push(a>=r?1:0)}function EQ(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"EQ[]",r,a);t.push(r===a?1:0)}function NEQ(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"NEQ[]",r,a);t.push(r!==a?1:0)}function ODD(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"ODD[]",r);t.push(Math.trunc(r)%2?1:0)}function EVEN(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"EVEN[]",r);t.push(Math.trunc(r)%2?0:1)}function IF(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"IF[]",t);if(!t){skip(e,true);exports.DEBUG&&console.log(e.step,"EIF[]")}}function EIF(e){exports.DEBUG&&console.log(e.step,"EIF[]")}function AND(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"AND[]",r,a);t.push(r&&a?1:0)}function OR(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"OR[]",r,a);t.push(r||a?1:0)}function NOT(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"NOT[]",r);t.push(r?0:1)}function DELTAP123(e,t){var r=t.stack;var a=r.pop();var n=t.fv;var s=t.pv;var o=t.ppem;var i=t.deltaBase+16*(e-1);var u=t.deltaShift;var l=t.z0;exports.DEBUG&&console.log(t.step,"DELTAP["+e+"]",a,r);for(var p=0;p<a;p++){var c=r.pop();var h=r.pop();var v=i+((240&h)>>4);if(v===o){var f=(15&h)-8;f>=0&&f++;exports.DEBUG&&console.log(t.step,"DELTAPFIX",c,"by",f*u);var d=l[c];n.setRelative(d,d,f*u,s)}}}function SDB(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"SDB[]",r);e.deltaBase=r}function SDS(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"SDS[]",r);e.deltaShift=Math.pow(.5,r)}function ADD(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"ADD[]",r,a);t.push(a+r)}function SUB(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"SUB[]",r,a);t.push(a-r)}function DIV(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"DIV[]",r,a);t.push(64*a/r)}function MUL(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"MUL[]",r,a);t.push(a*r/64)}function ABS(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"ABS[]",r);t.push(Math.abs(r))}function NEG(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"NEG[]",r);t.push(-r)}function FLOOR(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"FLOOR[]",r);t.push(64*Math.floor(r/64))}function CEILING(e){var t=e.stack;var r=t.pop();exports.DEBUG&&console.log(e.step,"CEILING[]",r);t.push(64*Math.ceil(r/64))}function ROUND(e,t){var r=t.stack;var a=r.pop();exports.DEBUG&&console.log(t.step,"ROUND[]");r.push(64*t.round(a/64))}function WCVTF(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"WCVTF[]",r,a);e.cvt[a]=r*e.ppem/e.font.unitsPerEm}function DELTAC123(e,t){var r=t.stack;var a=r.pop();var n=t.ppem;var s=t.deltaBase+16*(e-1);var o=t.deltaShift;exports.DEBUG&&console.log(t.step,"DELTAC["+e+"]",a,r);for(var i=0;i<a;i++){var u=r.pop();var l=r.pop();var p=s+((240&l)>>4);if(p===n){var c=(15&l)-8;c>=0&&c++;var h=c*o;exports.DEBUG&&console.log(t.step,"DELTACFIX",u,"by",h);t.cvt[u]+=h}}}function SROUND(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"SROUND[]",t);e.round=roundSuper;var r;switch(192&t){case 0:r=.5;break;case 64:r=1;break;case 128:r=2;break;default:throw new Error("invalid SROUND value")}e.srPeriod=r;switch(48&t){case 0:e.srPhase=0;break;case 16:e.srPhase=.25*r;break;case 32:e.srPhase=.5*r;break;case 48:e.srPhase=.75*r;break;default:throw new Error("invalid SROUND value")}t&=15;e.srThreshold=0===t?0:(t/8-.5)*r}function S45ROUND(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"S45ROUND[]",t);e.round=roundSuper;var r;switch(192&t){case 0:r=Math.sqrt(2)/2;break;case 64:r=Math.sqrt(2);break;case 128:r=2*Math.sqrt(2);break;default:throw new Error("invalid S45ROUND value")}e.srPeriod=r;switch(48&t){case 0:e.srPhase=0;break;case 16:e.srPhase=.25*r;break;case 32:e.srPhase=.5*r;break;case 48:e.srPhase=.75*r;break;default:throw new Error("invalid S45ROUND value")}t&=15;e.srThreshold=0===t?0:(t/8-.5)*r}function ROFF(e){exports.DEBUG&&console.log(e.step,"ROFF[]");e.round=roundOff}function RUTG(e){exports.DEBUG&&console.log(e.step,"RUTG[]");e.round=roundUpToGrid}function RDTG(e){exports.DEBUG&&console.log(e.step,"RDTG[]");e.round=roundDownToGrid}function SCANCTRL(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"SCANCTRL[]",t)}function SDPVTL(e,t){var r=t.stack;var a=r.pop();var n=r.pop();var s=t.z2[a];var o=t.z1[n];exports.DEBUG&&console.log(t.step,"SDPVTL["+e+"]",a,n);var i;var u;if(e){i=s.y-o.y;u=o.x-s.x}else{i=o.x-s.x;u=o.y-s.y}t.dpv=getUnitVector(i,u)}function GETINFO(e){var t=e.stack;var r=t.pop();var a=0;exports.DEBUG&&console.log(e.step,"GETINFO[]",r);1&r&&(a=35);32&r&&(a|=4096);t.push(a)}function ROLL(e){var t=e.stack;var r=t.pop();var a=t.pop();var n=t.pop();exports.DEBUG&&console.log(e.step,"ROLL[]");t.push(a);t.push(r);t.push(n)}function MAX(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"MAX[]",r,a);t.push(Math.max(a,r))}function MIN(e){var t=e.stack;var r=t.pop();var a=t.pop();exports.DEBUG&&console.log(e.step,"MIN[]",r,a);t.push(Math.min(a,r))}function SCANTYPE(e){var t=e.stack.pop();exports.DEBUG&&console.log(e.step,"SCANTYPE[]",t)}function INSTCTRL(e){var t=e.stack.pop();var r=e.stack.pop();exports.DEBUG&&console.log(e.step,"INSTCTRL[]",t,r);switch(t){case 1:e.inhibitGridFit=!!r;return;case 2:e.ignoreCvt=!!r;return;default:throw new Error("invalid INSTCTRL[] selector")}}function PUSHB(e,t){var r=t.stack;var a=t.prog;var n=t.ip;exports.DEBUG&&console.log(t.step,"PUSHB["+e+"]");for(var s=0;s<e;s++)r.push(a[++n]);t.ip=n}function PUSHW(e,t){var r=t.ip;var a=t.prog;var n=t.stack;exports.DEBUG&&console.log(t.ip,"PUSHW["+e+"]");for(var s=0;s<e;s++){var o=a[++r]<<8|a[++r];32768&o&&(o=-(1+(65535^o)));n.push(o)}t.ip=r}function MDRP_MIRP(e,t,r,a,n,s){var o=s.stack;var i=e&&o.pop();var u=o.pop();var l=s.rp0;var p=s.z0[l];var c=s.z1[u];var h=s.minDis;var v=s.fv;var f=s.dpv;var d;var g;var m;var y;g=d=f.distance(c,p,true,true);m=g>=0?1:-1;g=Math.abs(g);if(e){y=s.cvt[i];a&&Math.abs(g-y)<s.cvCutIn&&(g=y)}r&&g<h&&(g=h);a&&(g=s.round(g));v.setRelative(c,p,m*g,f);v.touch(c);exports.DEBUG&&console.log(s.step,(e?"MIRP[":"MDRP[")+(t?"M":"m")+(r?">":"_")+(a?"R":"_")+(0===n?"Gr":1===n?"Bl":2===n?"Wh":"")+"]",e?i+"("+s.cvt[i]+","+y+")":"",u,"(d =",d,"->",m*g,")");s.rp1=s.rp0;s.rp2=u;t&&(s.rp0=u)}oe=[SVTCA.bind(void 0,ce),SVTCA.bind(void 0,pe),SPVTCA.bind(void 0,ce),SPVTCA.bind(void 0,pe),SFVTCA.bind(void 0,ce),SFVTCA.bind(void 0,pe),SPVTL.bind(void 0,0),SPVTL.bind(void 0,1),SFVTL.bind(void 0,0),SFVTL.bind(void 0,1),SPVFS,SFVFS,GPV,GFV,SFVTPV,ISECT,SRP0,SRP1,SRP2,SZP0,SZP1,SZP2,SZPS,SLOOP,RTG,RTHG,SMD,ELSE,JMPR,SCVTCI,void 0,void 0,DUP,POP,CLEAR,SWAP,DEPTH,CINDEX,MINDEX,void 0,void 0,void 0,LOOPCALL,CALL,FDEF,void 0,MDAP.bind(void 0,0),MDAP.bind(void 0,1),IUP.bind(void 0,ce),IUP.bind(void 0,pe),SHP.bind(void 0,0),SHP.bind(void 0,1),SHC.bind(void 0,0),SHC.bind(void 0,1),SHZ.bind(void 0,0),SHZ.bind(void 0,1),SHPIX,IP,MSIRP.bind(void 0,0),MSIRP.bind(void 0,1),ALIGNRP,RTDG,MIAP.bind(void 0,0),MIAP.bind(void 0,1),NPUSHB,NPUSHW,WS,RS,WCVTP,RCVT,GC.bind(void 0,0),GC.bind(void 0,1),void 0,MD.bind(void 0,0),MD.bind(void 0,1),MPPEM,void 0,FLIPON,void 0,void 0,LT,LTEQ,GT,GTEQ,EQ,NEQ,ODD,EVEN,IF,EIF,AND,OR,NOT,DELTAP123.bind(void 0,1),SDB,SDS,ADD,SUB,DIV,MUL,ABS,NEG,FLOOR,CEILING,ROUND.bind(void 0,0),ROUND.bind(void 0,1),ROUND.bind(void 0,2),ROUND.bind(void 0,3),void 0,void 0,void 0,void 0,WCVTF,DELTAP123.bind(void 0,2),DELTAP123.bind(void 0,3),DELTAC123.bind(void 0,1),DELTAC123.bind(void 0,2),DELTAC123.bind(void 0,3),SROUND,S45ROUND,void 0,void 0,ROFF,void 0,RUTG,RDTG,POP,POP,void 0,void 0,void 0,void 0,void 0,SCANCTRL,SDPVTL.bind(void 0,0),SDPVTL.bind(void 0,1),GETINFO,void 0,ROLL,MAX,MIN,SCANTYPE,INSTCTRL,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,void 0,PUSHB.bind(void 0,1),PUSHB.bind(void 0,2),PUSHB.bind(void 0,3),PUSHB.bind(void 0,4),PUSHB.bind(void 0,5),PUSHB.bind(void 0,6),PUSHB.bind(void 0,7),PUSHB.bind(void 0,8),PUSHW.bind(void 0,1),PUSHW.bind(void 0,2),PUSHW.bind(void 0,3),PUSHW.bind(void 0,4),PUSHW.bind(void 0,5),PUSHW.bind(void 0,6),PUSHW.bind(void 0,7),PUSHW.bind(void 0,8),MDRP_MIRP.bind(void 0,0,0,0,0,0),MDRP_MIRP.bind(void 0,0,0,0,0,1),MDRP_MIRP.bind(void 0,0,0,0,0,2),MDRP_MIRP.bind(void 0,0,0,0,0,3),MDRP_MIRP.bind(void 0,0,0,0,1,0),MDRP_MIRP.bind(void 0,0,0,0,1,1),MDRP_MIRP.bind(void 0,0,0,0,1,2),MDRP_MIRP.bind(void 0,0,0,0,1,3),MDRP_MIRP.bind(void 0,0,0,1,0,0),MDRP_MIRP.bind(void 0,0,0,1,0,1),MDRP_MIRP.bind(void 0,0,0,1,0,2),MDRP_MIRP.bind(void 0,0,0,1,0,3),MDRP_MIRP.bind(void 0,0,0,1,1,0),MDRP_MIRP.bind(void 0,0,0,1,1,1),MDRP_MIRP.bind(void 0,0,0,1,1,2),MDRP_MIRP.bind(void 0,0,0,1,1,3),MDRP_MIRP.bind(void 0,0,1,0,0,0),MDRP_MIRP.bind(void 0,0,1,0,0,1),MDRP_MIRP.bind(void 0,0,1,0,0,2),MDRP_MIRP.bind(void 0,0,1,0,0,3),MDRP_MIRP.bind(void 0,0,1,0,1,0),MDRP_MIRP.bind(void 0,0,1,0,1,1),MDRP_MIRP.bind(void 0,0,1,0,1,2),MDRP_MIRP.bind(void 0,0,1,0,1,3),MDRP_MIRP.bind(void 0,0,1,1,0,0),MDRP_MIRP.bind(void 0,0,1,1,0,1),MDRP_MIRP.bind(void 0,0,1,1,0,2),MDRP_MIRP.bind(void 0,0,1,1,0,3),MDRP_MIRP.bind(void 0,0,1,1,1,0),MDRP_MIRP.bind(void 0,0,1,1,1,1),MDRP_MIRP.bind(void 0,0,1,1,1,2),MDRP_MIRP.bind(void 0,0,1,1,1,3),MDRP_MIRP.bind(void 0,1,0,0,0,0),MDRP_MIRP.bind(void 0,1,0,0,0,1),MDRP_MIRP.bind(void 0,1,0,0,0,2),MDRP_MIRP.bind(void 0,1,0,0,0,3),MDRP_MIRP.bind(void 0,1,0,0,1,0),MDRP_MIRP.bind(void 0,1,0,0,1,1),MDRP_MIRP.bind(void 0,1,0,0,1,2),MDRP_MIRP.bind(void 0,1,0,0,1,3),MDRP_MIRP.bind(void 0,1,0,1,0,0),MDRP_MIRP.bind(void 0,1,0,1,0,1),MDRP_MIRP.bind(void 0,1,0,1,0,2),MDRP_MIRP.bind(void 0,1,0,1,0,3),MDRP_MIRP.bind(void 0,1,0,1,1,0),MDRP_MIRP.bind(void 0,1,0,1,1,1),MDRP_MIRP.bind(void 0,1,0,1,1,2),MDRP_MIRP.bind(void 0,1,0,1,1,3),MDRP_MIRP.bind(void 0,1,1,0,0,0),MDRP_MIRP.bind(void 0,1,1,0,0,1),MDRP_MIRP.bind(void 0,1,1,0,0,2),MDRP_MIRP.bind(void 0,1,1,0,0,3),MDRP_MIRP.bind(void 0,1,1,0,1,0),MDRP_MIRP.bind(void 0,1,1,0,1,1),MDRP_MIRP.bind(void 0,1,1,0,1,2),MDRP_MIRP.bind(void 0,1,1,0,1,3),MDRP_MIRP.bind(void 0,1,1,1,0,0),MDRP_MIRP.bind(void 0,1,1,1,0,1),MDRP_MIRP.bind(void 0,1,1,1,0,2),MDRP_MIRP.bind(void 0,1,1,1,0,3),MDRP_MIRP.bind(void 0,1,1,1,1,0),MDRP_MIRP.bind(void 0,1,1,1,1,1),MDRP_MIRP.bind(void 0,1,1,1,1,2),MDRP_MIRP.bind(void 0,1,1,1,1,3)];
/**
 * Create a new token
 * @param {string} char a single char
 */function Token(e){this.char=e;this.state={};this.activeState=null}
/**
 * Create a new context range
 * @param {number} startIndex range start index
 * @param {number} endOffset range end index offset
 * @param {string} contextName owner context name
 */function ContextRange(e,t,r){this.contextName=r;this.startIndex=e;this.endOffset=t}
/**
 * Check context start and end
 * @param {string} contextName a unique context name
 * @param {function} checkStart a predicate function the indicates a context's start
 * @param {function} checkEnd a predicate function the indicates a context's end
 */function ContextChecker(e,t,r){this.contextName=e;this.openRange=null;this.ranges=[];this.checkStart=t;this.checkEnd=r}
/**
 * @typedef ContextParams
 * @type Object
 * @property {array} context context items
 * @property {number} currentIndex current item index
 */
/**
 * Create a context params
 * @param {array} context a list of items
 * @param {number} currentIndex current item index
 */function ContextParams(e,t){this.context=e;this.index=t;this.length=e.length;this.current=e[t];this.backtrack=e.slice(0,t);this.lookahead=e.slice(t+1)}
/**
 * Create an event instance
 * @param {string} eventId event unique id
 */function Event(e){this.eventId=e;this.subscribers=[]}
/**
 * Initialize a core events and auto subscribe required event handlers
 * @param {any} events an object that enlists core events handlers
 */function initializeCoreEvents(e){var t=this;var r=["start","end","next","newToken","contextStart","contextEnd","insertToken","removeToken","removeRange","replaceToken","replaceRange","composeRUD","updateContextsRanges"];r.forEach((function(e){Object.defineProperty(t.events,e,{value:new Event(e)})}));!e||r.forEach((function(r){var a=e[r];"function"===typeof a&&t.events[r].subscribe(a)}));var a=["insertToken","removeToken","removeRange","replaceToken","replaceRange","composeRUD"];a.forEach((function(e){t.events[e].subscribe(t.updateContextsRanges)}))}
/**
 * Converts a string into a list of tokens
 * @param {any} events tokenizer core events
 */function Tokenizer(e){this.tokens=[];this.registeredContexts={};this.contextCheckers=[];this.events={};this.registeredModifiers=[];initializeCoreEvents.call(this,e)}
/**
 * Sets the state of a token, usually called by a state modifier.
 * @param {string} key state item key
 * @param {any} value state item value
 */Token.prototype.setState=function(e,t){this.state[e]=t;this.activeState={key:e,value:this.state[e]};return this.activeState};Token.prototype.getState=function(e){return this.state[e]||null};
/**
 * Checks if an index exists in the tokens list.
 * @param {number} index token index
 */Tokenizer.prototype.inboundIndex=function(e){return e>=0&&e<this.tokens.length};
/**
 * Compose and apply a list of operations (replace, update, delete)
 * @param {array} RUDs replace, update and delete operations
 * TODO: Perf. Optimization (lengthBefore === lengthAfter ? dispatch once)
 */Tokenizer.prototype.composeRUD=function(e){var t=this;var r=true;var a=e.map((function(e){return t[e[0]].apply(t,e.slice(1).concat(r))}));var hasFAILObject=function(e){return"object"===typeof e&&e.hasOwnProperty("FAIL")};if(a.every(hasFAILObject))return{FAIL:"composeRUD: one or more operations hasn't completed successfully",report:a.filter(hasFAILObject)};this.dispatch("composeRUD",[a.filter((function(e){return!hasFAILObject(e)}))])};
/**
 * Replace a range of tokens with a list of tokens
 * @param {number} startIndex range start index
 * @param {number} offset range offset
 * @param {token} tokens a list of tokens to replace
 * @param {boolean} silent dispatch events and update context ranges
 */Tokenizer.prototype.replaceRange=function(e,t,r,a){t=null!==t?t:this.tokens.length;var n=r.every((function(e){return e instanceof Token}));if(!isNaN(e)&&this.inboundIndex(e)&&n){var s=this.tokens.splice.apply(this.tokens,[e,t].concat(r));a||this.dispatch("replaceToken",[e,t,r]);return[s,r]}return{FAIL:"replaceRange: invalid tokens or startIndex."}};
/**
 * Replace a token with another token
 * @param {number} index token index
 * @param {token} token a token to replace
 * @param {boolean} silent dispatch events and update context ranges
 */Tokenizer.prototype.replaceToken=function(e,t,r){if(!isNaN(e)&&this.inboundIndex(e)&&t instanceof Token){var a=this.tokens.splice(e,1,t);r||this.dispatch("replaceToken",[e,t]);return[a[0],t]}return{FAIL:"replaceToken: invalid token or index."}};
/**
 * Removes a range of tokens
 * @param {number} startIndex range start index
 * @param {number} offset range offset
 * @param {boolean} silent dispatch events and update context ranges
 */Tokenizer.prototype.removeRange=function(e,t,r){t=isNaN(t)?this.tokens.length:t;var a=this.tokens.splice(e,t);r||this.dispatch("removeRange",[a,e,t]);return a};
/**
 * Remove a token at a certain index
 * @param {number} index token index
 * @param {boolean} silent dispatch events and update context ranges
 */Tokenizer.prototype.removeToken=function(e,t){if(!isNaN(e)&&this.inboundIndex(e)){var r=this.tokens.splice(e,1);t||this.dispatch("removeToken",[r,e]);return r}return{FAIL:"removeToken: invalid token index."}};
/**
 * Insert a list of tokens at a certain index
 * @param {array} tokens a list of tokens to insert
 * @param {number} index insert the list of tokens at index
 * @param {boolean} silent dispatch events and update context ranges
 */Tokenizer.prototype.insertToken=function(e,t,r){var a=e.every((function(e){return e instanceof Token}));if(a){this.tokens.splice.apply(this.tokens,[t,0].concat(e));r||this.dispatch("insertToken",[e,t]);return e}return{FAIL:"insertToken: invalid token(s)."}};
/**
 * A state modifier that is called on 'newToken' event
 * @param {string} modifierId state modifier id
 * @param {function} condition a predicate function that returns true or false
 * @param {function} modifier a function to update token state
 */Tokenizer.prototype.registerModifier=function(e,t,r){this.events.newToken.subscribe((function(a,n){var s=[a,n];var o=null===t||true===t.apply(this,s);var i=[a,n];if(o){var u=r.apply(this,i);a.setState(e,u)}}));this.registeredModifiers.push(e)};
/**
 * Subscribe a handler to an event
 * @param {function} eventHandler an event handler function
 */Event.prototype.subscribe=function(e){return"function"===typeof e?this.subscribers.push(e)-1:{FAIL:"invalid '"+this.eventId+"' event handler"}};
/**
 * Unsubscribe an event handler
 * @param {string} subsId subscription id
 */Event.prototype.unsubscribe=function(e){this.subscribers.splice(e,1)};
/**
 * Sets context params current value index
 * @param {number} index context params current value index
 */ContextParams.prototype.setCurrentIndex=function(e){this.index=e;this.current=this.context[e];this.backtrack=this.context.slice(0,e);this.lookahead=this.context.slice(e+1)};
/**
 * Get an item at an offset from the current value
 * example (current value is 3):
 *  1    2   [3]   4    5   |   items values
 * -2   -1    0    1    2   |   offset values
 * @param {number} offset an offset from current value index
 */ContextParams.prototype.get=function(e){switch(true){case 0===e:return this.current;case e<0&&Math.abs(e)<=this.backtrack.length:return this.backtrack.slice(e)[0];case e>0&&e<=this.lookahead.length:return this.lookahead[e-1];default:return null}};
/**
 * Converts a context range into a string value
 * @param {contextRange} range a context range
 */Tokenizer.prototype.rangeToText=function(e){if(e instanceof ContextRange)return this.getRangeTokens(e).map((function(e){return e.char})).join("")};Tokenizer.prototype.getText=function(){return this.tokens.map((function(e){return e.char})).join("")};
/**
 * Get a context by name
 * @param {string} contextName context name to get
 */Tokenizer.prototype.getContext=function(e){var t=this.registeredContexts[e];return!t?null:t};
/**
 * Subscribes a new event handler to an event
 * @param {string} eventName event name to subscribe to
 * @param {function} eventHandler a function to be invoked on event
 */Tokenizer.prototype.on=function(e,t){var r=this.events[e];return r?r.subscribe(t):null};
/**
 * Dispatches an event
 * @param {string} eventName event name
 * @param {any} args event handler arguments
 */Tokenizer.prototype.dispatch=function(e,t){var r=this;var a=this.events[e];a instanceof Event&&a.subscribers.forEach((function(e){e.apply(r,t||[])}))};
/**
 * Register a new context checker
 * @param {string} contextName a unique context name
 * @param {function} contextStartCheck a predicate function that returns true on context start
 * @param {function} contextEndCheck  a predicate function that returns true on context end
 * TODO: call tokenize on registration to update context ranges with the new context.
 */Tokenizer.prototype.registerContextChecker=function(e,t,r){if(!!this.getContext(e))return{FAIL:"context name '"+e+"' is already registered."};if("function"!==typeof t)return{FAIL:"missing context start check."};if("function"!==typeof r)return{FAIL:"missing context end check."};var a=new ContextChecker(e,t,r);this.registeredContexts[e]=a;this.contextCheckers.push(a);return a};
/**
 * Gets a context range tokens
 * @param {contextRange} range a context range
 */Tokenizer.prototype.getRangeTokens=function(e){var t=e.startIndex+e.endOffset;return[].concat(this.tokens.slice(e.startIndex,t))};
/**
 * Gets the ranges of a context
 * @param {string} contextName context name
 */Tokenizer.prototype.getContextRanges=function(e){var t=this.getContext(e);return t?t.ranges:{FAIL:"context checker '"+e+"' is not registered."}};Tokenizer.prototype.resetContextsRanges=function(){var e=this.registeredContexts;for(var t in e)if(e.hasOwnProperty(t)){var r=e[t];r.ranges=[]}};Tokenizer.prototype.updateContextsRanges=function(){this.resetContextsRanges();var e=this.tokens.map((function(e){return e.char}));for(var t=0;t<e.length;t++){var r=new ContextParams(e,t);this.runContextCheck(r)}this.dispatch("updateContextsRanges",[this.registeredContexts])};
/**
 * Sets the end offset of an open range
 * @param {number} offset range end offset
 * @param {string} contextName context name
 */Tokenizer.prototype.setEndOffset=function(e,t){var r=this.getContext(t).openRange.startIndex;var a=new ContextRange(r,e,t);var n=this.getContext(t).ranges;a.rangeId=t+"."+n.length;n.push(a);this.getContext(t).openRange=null;return a};
/**
 * Runs a context check on the current context
 * @param {contextParams} contextParams current context params
 */Tokenizer.prototype.runContextCheck=function(e){var t=this;var r=e.index;this.contextCheckers.forEach((function(a){var n=a.contextName;var s=t.getContext(n).openRange;if(!s&&a.checkStart(e)){s=new ContextRange(r,null,n);t.getContext(n).openRange=s;t.dispatch("contextStart",[n,r])}if(!!s&&a.checkEnd(e)){var o=r-s.startIndex+1;var i=t.setEndOffset(o,n);t.dispatch("contextEnd",[n,i])}}))};
/**
 * Converts a text into a list of tokens
 * @param {string} text a text to tokenize
 */Tokenizer.prototype.tokenize=function(e){this.tokens=[];this.resetContextsRanges();var t=Array.from(e);this.dispatch("start");for(var r=0;r<t.length;r++){var a=t[r];var n=new ContextParams(t,r);this.dispatch("next",[n]);this.runContextCheck(n);var s=new Token(a);this.tokens.push(s);this.dispatch("newToken",[s,n])}this.dispatch("end",[this.tokens]);return this.tokens};
/**
 * Check if a char is Arabic
 * @param {string} c a single char
 */function isArabicChar(e){return/[\u0600-\u065F\u066A-\u06D2\u06FA-\u06FF]/.test(e)}
/**
 * Check if a char is an isolated arabic char
 * @param {string} c a single char
 */function isIsolatedArabicChar(e){return/[\u0630\u0690\u0621\u0631\u0661\u0671\u0622\u0632\u0672\u0692\u06C2\u0623\u0673\u0693\u06C3\u0624\u0694\u06C4\u0625\u0675\u0695\u06C5\u06E5\u0676\u0696\u06C6\u0627\u0677\u0697\u06C7\u0648\u0688\u0698\u06C8\u0689\u0699\u06C9\u068A\u06CA\u066B\u068B\u06CB\u068C\u068D\u06CD\u06FD\u068E\u06EE\u06FE\u062F\u068F\u06CF\u06EF]/.test(e)}
/**
 * Check if a char is an Arabic Tashkeel char
 * @param {string} c a single char
 */function isTashkeelArabicChar(e){return/[\u0600-\u0605\u060C-\u060E\u0610-\u061B\u061E\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/.test(e)}
/**
 * Check if a char is Latin
 * @param {string} c a single char
 */function isLatinChar(e){return/[A-z]/.test(e)}
/**
 * Check if a char is whitespace char
 * @param {string} c a single char
 */function isWhiteSpace(e){return/\s/.test(e)}
/**
 * Create feature query instance
 * @param {Font} font opentype font instance
 */function FeatureQuery(e){this.font=e;this.features={}}
/**
 * @typedef SubstitutionAction
 * @type Object
 * @property {number} id substitution type
 * @property {string} tag feature tag
 * @property {any} substitution substitution value(s)
 */
/**
 * Create a substitution action instance
 * @param {SubstitutionAction} action
 */function SubstitutionAction(e){this.id=e.id;this.tag=e.tag;this.substitution=e.substitution}
/**
 * Lookup a coverage table
 * @param {number} glyphIndex glyph index
 * @param {CoverageTable} coverage coverage table
 */function lookupCoverage(e,t){if(!e)return-1;switch(t.format){case 1:return t.glyphs.indexOf(e);case 2:var r=t.ranges;for(var a=0;a<r.length;a++){var n=r[a];if(e>=n.start&&e<=n.end){var s=e-n.start;return n.index+s}}break;default:return-1}return-1}
/**
 * Handle a single substitution - format 1
 * @param {ContextParams} contextParams context params to lookup
 */function singleSubstitutionFormat1(e,t){var r=lookupCoverage(e,t.coverage);return-1===r?null:e+t.deltaGlyphId}
/**
 * Handle a single substitution - format 2
 * @param {ContextParams} contextParams context params to lookup
 */function singleSubstitutionFormat2(e,t){var r=lookupCoverage(e,t.coverage);return-1===r?null:t.substitute[r]}
/**
 * Lookup a list of coverage tables
 * @param {any} coverageList a list of coverage tables
 * @param {ContextParams} contextParams context params to lookup
 */function lookupCoverageList(e,t){var r=[];for(var a=0;a<e.length;a++){var n=e[a];var s=t.current;s=Array.isArray(s)?s[0]:s;var o=lookupCoverage(s,n);-1!==o&&r.push(o)}return r.length!==e.length?-1:r}
/**
 * Handle chaining context substitution - format 3
 * @param {ContextParams} contextParams context params to lookup
 */function chainingSubstitutionFormat3(e,t){var r=t.inputCoverage.length+t.lookaheadCoverage.length+t.backtrackCoverage.length;if(e.context.length<r)return[];var a=lookupCoverageList(t.inputCoverage,e);if(-1===a)return[];var n=t.inputCoverage.length-1;if(e.lookahead.length<t.lookaheadCoverage.length)return[];var s=e.lookahead.slice(n);while(s.length&&isTashkeelArabicChar(s[0].char))s.shift();var o=new ContextParams(s,0);var i=lookupCoverageList(t.lookaheadCoverage,o);var u=[].concat(e.backtrack);u.reverse();while(u.length&&isTashkeelArabicChar(u[0].char))u.shift();if(u.length<t.backtrackCoverage.length)return[];var l=new ContextParams(u,0);var p=lookupCoverageList(t.backtrackCoverage,l);var c=a.length===t.inputCoverage.length&&i.length===t.lookaheadCoverage.length&&p.length===t.backtrackCoverage.length;var h=[];if(c)for(var v=0;v<t.lookupRecords.length;v++){var f=t.lookupRecords[v];var d=f.lookupListIndex;var g=this.getLookupByIndex(d);for(var m=0;m<g.subtables.length;m++){var y=g.subtables[m];var b=this.getLookupMethod(g,y);var S=this.getSubstitutionType(g,y);if("12"===S)for(var x=0;x<a.length;x++){var T=e.get(x);var k=b(T);k&&h.push(k)}}}return h}
/**
 * Handle ligature substitution - format 1
 * @param {ContextParams} contextParams context params to lookup
 */function ligatureSubstitutionFormat1(e,t){var r=e.current;var a=lookupCoverage(r,t.coverage);if(-1===a)return null;var n;var s=t.ligatureSets[a];for(var o=0;o<s.length;o++){n=s[o];for(var i=0;i<n.components.length;i++){var u=e.lookahead[i];var l=n.components[i];if(u!==l)break;if(i===n.components.length-1)return n}}return null}
/**
 * Handle decomposition substitution - format 1
 * @param {number} glyphIndex glyph index
 * @param {any} subtable subtable
 */function decompositionSubstitutionFormat1(e,t){var r=lookupCoverage(e,t.coverage);return-1===r?null:t.sequences[r]}FeatureQuery.prototype.getDefaultScriptFeaturesIndexes=function(){var e=this.font.tables.gsub.scripts;for(var t=0;t<e.length;t++){var r=e[t];if("DFLT"===r.tag)return r.script.defaultLangSys.featureIndexes}return[]};
/**
 * Get feature indexes of a specific script
 * @param {string} scriptTag script tag
 */FeatureQuery.prototype.getScriptFeaturesIndexes=function(e){var t=this.font.tables;if(!t.gsub)return[];if(!e)return this.getDefaultScriptFeaturesIndexes();var r=this.font.tables.gsub.scripts;for(var a=0;a<r.length;a++){var n=r[a];if(n.tag===e&&n.script.defaultLangSys)return n.script.defaultLangSys.featureIndexes;var s=n.langSysRecords;if(!!s)for(var o=0;o<s.length;o++){var i=s[o];if(i.tag===e){var u=i.langSys;return u.featureIndexes}}}return this.getDefaultScriptFeaturesIndexes()};
/**
 * Map a feature tag to a gsub feature
 * @param {any} features gsub features
 * @param {string} scriptTag script tag
 */FeatureQuery.prototype.mapTagsToFeatures=function(e,t){var r={};for(var a=0;a<e.length;a++){var n=e[a].tag;var s=e[a].feature;r[n]=s}this.features[t].tags=r};
/**
 * Get features of a specific script
 * @param {string} scriptTag script tag
 */FeatureQuery.prototype.getScriptFeatures=function(e){var t=this.features[e];if(this.features.hasOwnProperty(e))return t;var r=this.getScriptFeaturesIndexes(e);if(!r)return null;var a=this.font.tables.gsub;t=r.map((function(e){return a.features[e]}));this.features[e]=t;this.mapTagsToFeatures(t,e);return t};
/**
 * Get substitution type
 * @param {any} lookupTable lookup table
 * @param {any} subtable subtable
 */FeatureQuery.prototype.getSubstitutionType=function(e,t){var r=e.lookupType.toString();var a=t.substFormat.toString();return r+a};
/**
 * Get lookup method
 * @param {any} lookupTable lookup table
 * @param {any} subtable subtable
 */FeatureQuery.prototype.getLookupMethod=function(e,t){var r=this;var a=this.getSubstitutionType(e,t);switch(a){case"11":return function(e){return singleSubstitutionFormat1.apply(r,[e,t])};case"12":return function(e){return singleSubstitutionFormat2.apply(r,[e,t])};case"63":return function(e){return chainingSubstitutionFormat3.apply(r,[e,t])};case"41":return function(e){return ligatureSubstitutionFormat1.apply(r,[e,t])};case"21":return function(e){return decompositionSubstitutionFormat1.apply(r,[e,t])};default:throw new Error("lookupType: "+e.lookupType+" - substFormat: "+t.substFormat+" is not yet supported")}};
/**
 * @typedef FQuery
 * @type Object
 * @param {string} tag feature tag
 * @param {string} script feature script
 * @param {ContextParams} contextParams context params
 */
/**
 * Lookup a feature using a query parameters
 * @param {FQuery} query feature query
 */FeatureQuery.prototype.lookupFeature=function(e){var t=e.contextParams;var r=t.index;var a=this.getFeature({tag:e.tag,script:e.script});if(!a)return new Error("font '"+this.font.names.fullName.en+"' doesn't support feature '"+e.tag+"' for script '"+e.script+"'.");var n=this.getFeatureLookups(a);var s=[].concat(t.context);for(var o=0;o<n.length;o++){var i=n[o];var u=this.getLookupSubtables(i);for(var l=0;l<u.length;l++){var p=u[l];var c=this.getSubstitutionType(i,p);var h=this.getLookupMethod(i,p);var v=void 0;switch(c){case"11":v=h(t.current);v&&s.splice(r,1,new SubstitutionAction({id:11,tag:e.tag,substitution:v}));break;case"12":v=h(t.current);v&&s.splice(r,1,new SubstitutionAction({id:12,tag:e.tag,substitution:v}));break;case"63":v=h(t);Array.isArray(v)&&v.length&&s.splice(r,1,new SubstitutionAction({id:63,tag:e.tag,substitution:v}));break;case"41":v=h(t);v&&s.splice(r,1,new SubstitutionAction({id:41,tag:e.tag,substitution:v}));break;case"21":v=h(t.current);v&&s.splice(r,1,new SubstitutionAction({id:21,tag:e.tag,substitution:v}));break}t=new ContextParams(s,r);Array.isArray(v)&&!v.length||(v=null)}}return s.length?s:null};
/**
 * Checks if a font supports a specific features
 * @param {FQuery} query feature query object
 */FeatureQuery.prototype.supports=function(e){if(!e.script)return false;this.getScriptFeatures(e.script);var t=this.features.hasOwnProperty(e.script);if(!e.tag)return t;var r=this.features[e.script].some((function(t){return t.tag===e.tag}));return t&&r};
/**
 * Get lookup table subtables
 * @param {any} lookupTable lookup table
 */FeatureQuery.prototype.getLookupSubtables=function(e){return e.subtables||null};
/**
 * Get lookup table by index
 * @param {number} index lookup table index
 */FeatureQuery.prototype.getLookupByIndex=function(e){var t=this.font.tables.gsub.lookups;return t[e]||null};
/**
 * Get lookup tables for a feature
 * @param {string} feature
 */FeatureQuery.prototype.getFeatureLookups=function(e){return e.lookupListIndexes.map(this.getLookupByIndex.bind(this))};
/**
 * Query a feature by it's properties
 * @param {any} query an object that describes the properties of a query
 */FeatureQuery.prototype.getFeature=function getFeature(e){if(!this.font)return{FAIL:"No font was found"};this.features.hasOwnProperty(e.script)||this.getScriptFeatures(e.script);var t=this.features[e.script];return t?t.tags[e.tag]?this.features[e.script].tags[e.tag]:null:{FAIL:"No feature for script "+e.script}};function arabicWordStartCheck(e){var t=e.current;var r=e.get(-1);return null===r&&isArabicChar(t)||!isArabicChar(r)&&isArabicChar(t)}function arabicWordEndCheck(e){var t=e.get(1);return null===t||!isArabicChar(t)}var fe={startCheck:arabicWordStartCheck,endCheck:arabicWordEndCheck};function arabicSentenceStartCheck(e){var t=e.current;var r=e.get(-1);return(isArabicChar(t)||isTashkeelArabicChar(t))&&!isArabicChar(r)}function arabicSentenceEndCheck(e){var t=e.get(1);switch(true){case null===t:return true;case!isArabicChar(t)&&!isTashkeelArabicChar(t):var r=isWhiteSpace(t);if(!r)return true;if(r){var a=false;a=e.lookahead.some((function(e){return isArabicChar(e)||isTashkeelArabicChar(e)}));if(!a)return true}break;default:return false}}var de={startCheck:arabicSentenceStartCheck,endCheck:arabicSentenceEndCheck};
/**
 * Apply single substitution format 1
 * @param {Array} substitutions substitutions
 * @param {any} tokens a list of tokens
 * @param {number} index token index
 */function singleSubstitutionFormat1$1(e,t,r){t[r].setState(e.tag,e.substitution)}
/**
 * Apply single substitution format 2
 * @param {Array} substitutions substitutions
 * @param {any} tokens a list of tokens
 * @param {number} index token index
 */function singleSubstitutionFormat2$1(e,t,r){t[r].setState(e.tag,e.substitution)}
/**
 * Apply chaining context substitution format 3
 * @param {Array} substitutions substitutions
 * @param {any} tokens a list of tokens
 * @param {number} index token index
 */function chainingSubstitutionFormat3$1(e,t,r){e.substitution.forEach((function(a,n){var s=t[r+n];s.setState(e.tag,a)}))}
/**
 * Apply ligature substitution format 1
 * @param {Array} substitutions substitutions
 * @param {any} tokens a list of tokens
 * @param {number} index token index
 */function ligatureSubstitutionFormat1$1(e,t,r){var a=t[r];a.setState(e.tag,e.substitution.ligGlyph);var n=e.substitution.components.length;for(var s=0;s<n;s++){a=t[r+s+1];a.setState("deleted",true)}}var ge={11:singleSubstitutionFormat1$1,12:singleSubstitutionFormat2$1,63:chainingSubstitutionFormat3$1,41:ligatureSubstitutionFormat1$1};
/**
 * Apply substitutions to a list of tokens
 * @param {Array} substitutions substitutions
 * @param {any} tokens a list of tokens
 * @param {number} index token index
 */function applySubstitution(e,t,r){e instanceof SubstitutionAction&&ge[e.id]&&ge[e.id](e,t,r)}
/**
 * Check if a char can be connected to it's preceding char
 * @param {ContextParams} charContextParams context params of a char
 */function willConnectPrev(e){var t=[].concat(e.backtrack);for(var r=t.length-1;r>=0;r--){var a=t[r];var n=isIsolatedArabicChar(a);var s=isTashkeelArabicChar(a);if(!n&&!s)return true;if(n)return false}return false}
/**
 * Check if a char can be connected to it's proceeding char
 * @param {ContextParams} charContextParams context params of a char
 */function willConnectNext(e){if(isIsolatedArabicChar(e.current))return false;for(var t=0;t<e.lookahead.length;t++){var r=e.lookahead[t];var a=isTashkeelArabicChar(r);if(!a)return true}return false}
/**
 * Apply arabic presentation forms to a list of tokens
 * @param {ContextRange} range a range of tokens
 */function arabicPresentationForms(e){var t=this;var r="arab";var a=this.featuresTags[r];var n=this.tokenizer.getRangeTokens(e);if(1!==n.length){var s=new ContextParams(n.map((function(e){return e.getState("glyphIndex")})),0);var o=new ContextParams(n.map((function(e){return e.char})),0);n.forEach((function(e,i){if(!isTashkeelArabicChar(e.char)){s.setCurrentIndex(i);o.setCurrentIndex(i);var u=0;willConnectPrev(o)&&(u|=1);willConnectNext(o)&&(u|=2);var l;switch(u){case 1:l="fina";break;case 2:l="init";break;case 3:l="medi";break}if(-1!==a.indexOf(l)){var p=t.query.lookupFeature({tag:l,script:r,contextParams:s});if(p instanceof Error)return console.info(p.message);p.forEach((function(e,t){if(e instanceof SubstitutionAction){applySubstitution(e,n,t);s.context[t]=e.substitution}}))}}}))}}
/**
 * Update context params
 * @param {any} tokens a list of tokens
 * @param {number} index current item index
 */function getContextParams(e,t){var r=e.map((function(e){return e.activeState.value}));return new ContextParams(r,t||0)}
/**
 * Apply Arabic required ligatures to a context range
 * @param {ContextRange} range a range of tokens
 */function arabicRequiredLigatures(e){var t=this;var r="arab";var a=this.tokenizer.getRangeTokens(e);var n=getContextParams(a);n.context.forEach((function(e,s){n.setCurrentIndex(s);var o=t.query.lookupFeature({tag:"rlig",script:r,contextParams:n});if(o.length){o.forEach((function(e){return applySubstitution(e,a,s)}));n=getContextParams(a)}}))}function latinWordStartCheck(e){var t=e.current;var r=e.get(-1);return null===r&&isLatinChar(t)||!isLatinChar(r)&&isLatinChar(t)}function latinWordEndCheck(e){var t=e.get(1);return null===t||!isLatinChar(t)}var me={startCheck:latinWordStartCheck,endCheck:latinWordEndCheck};
/**
 * Update context params
 * @param {any} tokens a list of tokens
 * @param {number} index current item index
 */function getContextParams$1(e,t){var r=e.map((function(e){return e.activeState.value}));return new ContextParams(r,t||0)}
/**
 * Apply Arabic required ligatures to a context range
 * @param {ContextRange} range a range of tokens
 */function latinLigature(e){var t=this;var r="latn";var a=this.tokenizer.getRangeTokens(e);var n=getContextParams$1(a);n.context.forEach((function(e,s){n.setCurrentIndex(s);var o=t.query.lookupFeature({tag:"liga",script:r,contextParams:n});if(o.length){o.forEach((function(e){return applySubstitution(e,a,s)}));n=getContextParams$1(a)}}))}
/**
 * Create Bidi. features
 * @param {string} baseDir text base direction. value either 'ltr' or 'rtl'
 */function Bidi(e){this.baseDir=e||"ltr";this.tokenizer=new Tokenizer;this.featuresTags={}}
/**
 * Sets Bidi text
 * @param {string} text a text input
 */Bidi.prototype.setText=function(e){this.text=e};Bidi.prototype.contextChecks={latinWordCheck:me,arabicWordCheck:fe,arabicSentenceCheck:de};function registerContextChecker(e){var t=this.contextChecks[e+"Check"];return this.tokenizer.registerContextChecker(e,t.startCheck,t.endCheck)}function tokenizeText(){registerContextChecker.call(this,"latinWord");registerContextChecker.call(this,"arabicWord");registerContextChecker.call(this,"arabicSentence");return this.tokenizer.tokenize(this.text)}function reverseArabicSentences(){var e=this;var t=this.tokenizer.getContextRanges("arabicSentence");t.forEach((function(t){var r=e.tokenizer.getRangeTokens(t);e.tokenizer.replaceRange(t.startIndex,t.endOffset,r.reverse())}))}
/**
 * Register supported features tags
 * @param {script} script script tag
 * @param {Array} tags features tags list
 */Bidi.prototype.registerFeatures=function(e,t){var r=this;var a=t.filter((function(t){return r.query.supports({script:e,tag:t})}));this.featuresTags.hasOwnProperty(e)?this.featuresTags[e]=this.featuresTags[e].concat(a):this.featuresTags[e]=a};
/**
 * Apply GSUB features
 * @param {Array} tagsList a list of features tags
 * @param {string} script a script tag
 * @param {Font} font opentype font instance
 */Bidi.prototype.applyFeatures=function(e,t){if(!e)throw new Error("No valid font was provided to apply features");this.query||(this.query=new FeatureQuery(e));for(var r=0;r<t.length;r++){var a=t[r];this.query.supports({script:a.script})&&this.registerFeatures(a.script,a.tags)}};
/**
 * Register a state modifier
 * @param {string} modifierId state modifier id
 * @param {function} condition a predicate function that returns true or false
 * @param {function} modifier a modifier function to set token state
 */Bidi.prototype.registerModifier=function(e,t,r){this.tokenizer.registerModifier(e,t,r)};function checkGlyphIndexStatus(){if(-1===this.tokenizer.registeredModifiers.indexOf("glyphIndex"))throw new Error("glyphIndex modifier is required to apply arabic presentation features.")}function applyArabicPresentationForms(){var e=this;var t="arab";if(this.featuresTags.hasOwnProperty(t)){checkGlyphIndexStatus.call(this);var r=this.tokenizer.getContextRanges("arabicWord");r.forEach((function(t){arabicPresentationForms.call(e,t)}))}}function applyArabicRequireLigatures(){var e=this;var t="arab";if(this.featuresTags.hasOwnProperty(t)){var r=this.featuresTags[t];if(-1!==r.indexOf("rlig")){checkGlyphIndexStatus.call(this);var a=this.tokenizer.getContextRanges("arabicWord");a.forEach((function(t){arabicRequiredLigatures.call(e,t)}))}}}function applyLatinLigatures(){var e=this;var t="latn";if(this.featuresTags.hasOwnProperty(t)){var r=this.featuresTags[t];if(-1!==r.indexOf("liga")){checkGlyphIndexStatus.call(this);var a=this.tokenizer.getContextRanges("latinWord");a.forEach((function(t){latinLigature.call(e,t)}))}}}
/**
 * Check if a context is registered
 * @param {string} contextId context id
 */Bidi.prototype.checkContextReady=function(e){return!!this.tokenizer.getContext(e)};Bidi.prototype.applyFeaturesToContexts=function(){if(this.checkContextReady("arabicWord")){applyArabicPresentationForms.call(this);applyArabicRequireLigatures.call(this)}this.checkContextReady("latinWord")&&applyLatinLigatures.call(this);this.checkContextReady("arabicSentence")&&reverseArabicSentences.call(this)};
/**
 * process text input
 * @param {string} text an input text
 */Bidi.prototype.processText=function(e){if(!this.text||this.text!==e){this.setText(e);tokenizeText.call(this);this.applyFeaturesToContexts()}};
/**
 * Process a string of text to identify and adjust
 * bidirectional text entities.
 * @param {string} text input text
 */Bidi.prototype.getBidiText=function(e){this.processText(e);return this.tokenizer.getText()};
/**
 * Get the current state index of each token
 * @param {text} text an input text
 */Bidi.prototype.getTextGlyphs=function(e){this.processText(e);var t=[];for(var r=0;r<this.tokenizer.tokens.length;r++){var a=this.tokenizer.tokens[r];if(!a.state.deleted){var n=a.activeState.value;t.push(Array.isArray(n)?n[0]:n)}}return t};
/**
 * @typedef FontOptions
 * @type Object
 * @property {Boolean} empty - whether to create a new empty font
 * @property {string} familyName
 * @property {string} styleName
 * @property {string=} fullName
 * @property {string=} postScriptName
 * @property {string=} designer
 * @property {string=} designerURL
 * @property {string=} manufacturer
 * @property {string=} manufacturerURL
 * @property {string=} license
 * @property {string=} licenseURL
 * @property {string=} version
 * @property {string=} description
 * @property {string=} copyright
 * @property {string=} trademark
 * @property {Number} unitsPerEm
 * @property {Number} ascender
 * @property {Number} descender
 * @property {Number} createdTimestamp
 * @property {string=} weightClass
 * @property {string=} widthClass
 * @property {string=} fsSelection
 */
/**
 * A Font represents a loaded OpenType font file.
 * It contains a set of glyphs and methods to draw text on a drawing context,
 * or to get a path representing the text.
 * @exports opentype.Font
 * @class
 * @param {FontOptions}
 * @constructor
 */function Font(e){e=e||{};e.tables=e.tables||{};if(!e.empty){checkArgument(e.familyName,"When creating a new Font object, familyName is required.");checkArgument(e.styleName,"When creating a new Font object, styleName is required.");checkArgument(e.unitsPerEm,"When creating a new Font object, unitsPerEm is required.");checkArgument(e.ascender,"When creating a new Font object, ascender is required.");checkArgument(e.descender<=0,"When creating a new Font object, negative descender value is required.");this.names={fontFamily:{en:e.familyName||" "},fontSubfamily:{en:e.styleName||" "},fullName:{en:e.fullName||e.familyName+" "+e.styleName},postScriptName:{en:e.postScriptName||(e.familyName+e.styleName).replace(/\s/g,"")},designer:{en:e.designer||" "},designerURL:{en:e.designerURL||" "},manufacturer:{en:e.manufacturer||" "},manufacturerURL:{en:e.manufacturerURL||" "},license:{en:e.license||" "},licenseURL:{en:e.licenseURL||" "},version:{en:e.version||"Version 0.1"},description:{en:e.description||" "},copyright:{en:e.copyright||" "},trademark:{en:e.trademark||" "}};this.unitsPerEm=e.unitsPerEm||1e3;this.ascender=e.ascender;this.descender=e.descender;this.createdTimestamp=e.createdTimestamp;this.tables=Object.assign(e.tables,{os2:Object.assign({usWeightClass:e.weightClass||this.usWeightClasses.MEDIUM,usWidthClass:e.widthClass||this.usWidthClasses.MEDIUM,fsSelection:e.fsSelection||this.fsSelectionValues.REGULAR},e.tables.os2)})}this.supported=true;this.glyphs=new w.GlyphSet(this,e.glyphs||[]);this.encoding=new DefaultEncoding(this);this.position=new Position(this);this.substitution=new Substitution(this);this.tables=this.tables||{};this._push=null;this._hmtxTableData={};Object.defineProperty(this,"hinting",{get:function(){return this._hinting?this._hinting:"truetype"===this.outlinesFormat?this._hinting=new Hinting(this):void 0}})}
/**
 * Check if the font has a glyph for the given character.
 * @param  {string}
 * @return {Boolean}
 */Font.prototype.hasChar=function(e){return null!==this.encoding.charToGlyphIndex(e)};
/**
 * Convert the given character to a single glyph index.
 * Note that this function assumes that there is a one-to-one mapping between
 * the given character and a glyph; for complex scripts this might not be the case.
 * @param  {string}
 * @return {Number}
 */Font.prototype.charToGlyphIndex=function(e){return this.encoding.charToGlyphIndex(e)};
/**
 * Convert the given character to a single Glyph object.
 * Note that this function assumes that there is a one-to-one mapping between
 * the given character and a glyph; for complex scripts this might not be the case.
 * @param  {string}
 * @return {opentype.Glyph}
 */Font.prototype.charToGlyph=function(e){var t=this.charToGlyphIndex(e);var r=this.glyphs.get(t);r||(r=this.glyphs.get(0));return r};
/**
 * Update features
 * @param {any} options features options
 */Font.prototype.updateFeatures=function(e){return this.defaultRenderOptions.features.map((function(t){return"latn"===t.script?{script:"latn",tags:t.tags.filter((function(t){return e[t]}))}:t}))};
/**
 * Convert the given text to a list of Glyph objects.
 * Note that there is no strict one-to-one mapping between characters and
 * glyphs, so the list of returned glyphs can be larger or smaller than the
 * length of the given string.
 * @param  {string}
 * @param  {GlyphRenderOptions} [options]
 * @return {opentype.Glyph[]}
 */Font.prototype.stringToGlyphs=function(e,t){var r=this;var a=new Bidi;var charToGlyphIndexMod=function(e){return r.charToGlyphIndex(e.char)};a.registerModifier("glyphIndex",null,charToGlyphIndexMod);var n=t?this.updateFeatures(t.features):this.defaultRenderOptions.features;a.applyFeatures(this,n);var s=a.getTextGlyphs(e);var o=s.length;var i=new Array(o);var u=this.glyphs.get(0);for(var l=0;l<o;l+=1)i[l]=this.glyphs.get(s[l])||u;return i};
/**
 * @param  {string}
 * @return {Number}
 */Font.prototype.nameToGlyphIndex=function(e){return this.glyphNames.nameToGlyphIndex(e)};
/**
 * @param  {string}
 * @return {opentype.Glyph}
 */Font.prototype.nameToGlyph=function(e){var t=this.nameToGlyphIndex(e);var r=this.glyphs.get(t);r||(r=this.glyphs.get(0));return r};
/**
 * @param  {Number}
 * @return {String}
 */Font.prototype.glyphIndexToName=function(e){return this.glyphNames.glyphIndexToName?this.glyphNames.glyphIndexToName(e):""};
/**
 * Retrieve the value of the kerning pair between the left glyph (or its index)
 * and the right glyph (or its index). If no kerning pair is found, return 0.
 * The kerning value gets added to the advance width when calculating the spacing
 * between glyphs.
 * For GPOS kerning, this method uses the default script and language, which covers
 * most use cases. To have greater control, use font.position.getKerningValue .
 * @param  {opentype.Glyph} leftGlyph
 * @param  {opentype.Glyph} rightGlyph
 * @return {Number}
 */Font.prototype.getKerningValue=function(e,t){e=e.index||e;t=t.index||t;var r=this.position.defaultKerningTables;return r?this.position.getKerningValue(r,e,t):this.kerningPairs[e+","+t]||0};
/**
 * @typedef GlyphRenderOptions
 * @type Object
 * @property {string} [script] - script used to determine which features to apply. By default, 'DFLT' or 'latn' is used.
 *                               See https://www.microsoft.com/typography/otspec/scripttags.htm
 * @property {string} [language='dflt'] - language system used to determine which features to apply.
 *                                        See https://www.microsoft.com/typography/developers/opentype/languagetags.aspx
 * @property {boolean} [kerning=true] - whether to include kerning values
 * @property {object} [features] - OpenType Layout feature tags. Used to enable or disable the features of the given script/language system.
 *                                 See https://www.microsoft.com/typography/otspec/featuretags.htm
 */Font.prototype.defaultRenderOptions={kerning:true,features:[{script:"arab",tags:["init","medi","fina","rlig"]},{script:"latn",tags:["liga","rlig"]}]};
/**
 * Helper function that invokes the given callback for each glyph in the given text.
 * The callback gets `(glyph, x, y, fontSize, options)`.* @param  {string} text
 * @param {string} text - The text to apply.
 * @param  {number} [x=0] - Horizontal position of the beginning of the text.
 * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
 * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 * @param  {GlyphRenderOptions=} options
 * @param  {Function} callback
 */Font.prototype.forEachGlyph=function(e,t,r,a,n,s){t=void 0!==t?t:0;r=void 0!==r?r:0;a=void 0!==a?a:72;n=Object.assign({},this.defaultRenderOptions,n);var o=1/this.unitsPerEm*a;var i=this.stringToGlyphs(e,n);var u;if(n.kerning){var l=n.script||this.position.getDefaultScriptName();u=this.position.getKerningTables(l,n.language)}for(var p=0;p<i.length;p+=1){var c=i[p];s.call(this,c,t,r,a,n);c.advanceWidth&&(t+=c.advanceWidth*o);if(n.kerning&&p<i.length-1){var h=u?this.position.getKerningValue(u,c.index,i[p+1].index):this.getKerningValue(c,i[p+1]);t+=h*o}n.letterSpacing?t+=n.letterSpacing*a:n.tracking&&(t+=n.tracking/1e3*a)}return t};
/**
 * Create a Path object that represents the given text.
 * @param  {string} text - The text to create.
 * @param  {number} [x=0] - Horizontal position of the beginning of the text.
 * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
 * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 * @param  {GlyphRenderOptions=} options
 * @return {opentype.Path}
 */Font.prototype.getPath=function(e,t,r,a,n){var s=new Path;this.forEachGlyph(e,t,r,a,n,(function(e,t,r,a){var o=e.getPath(t,r,a,n,this);s.extend(o)}));return s};
/**
 * Create an array of Path objects that represent the glyphs of a given text.
 * @param  {string} text - The text to create.
 * @param  {number} [x=0] - Horizontal position of the beginning of the text.
 * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
 * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 * @param  {GlyphRenderOptions=} options
 * @return {opentype.Path[]}
 */Font.prototype.getPaths=function(e,t,r,a,n){var s=[];this.forEachGlyph(e,t,r,a,n,(function(e,t,r,a){var o=e.getPath(t,r,a,n,this);s.push(o)}));return s};
/**
 * Returns the advance width of a text.
 *
 * This is something different than Path.getBoundingBox() as for example a
 * suffixed whitespace increases the advanceWidth but not the bounding box
 * or an overhanging letter like a calligraphic 'f' might have a quite larger
 * bounding box than its advance width.
 *
 * This corresponds to canvas2dContext.measureText(text).width
 *
 * @param  {string} text - The text to create.
 * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 * @param  {GlyphRenderOptions=} options
 * @return advance width
 */Font.prototype.getAdvanceWidth=function(e,t,r){return this.forEachGlyph(e,0,0,t,r,(function(){}))};
/**
 * Draw the text on the given drawing context.
 * @param  {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
 * @param  {string} text - The text to create.
 * @param  {number} [x=0] - Horizontal position of the beginning of the text.
 * @param  {number} [y=0] - Vertical position of the *baseline* of the text.
 * @param  {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 * @param  {GlyphRenderOptions=} options
 */Font.prototype.draw=function(e,t,r,a,n,s){this.getPath(t,r,a,n,s).draw(e)};
/**
 * Draw the points of all glyphs in the text.
 * On-curve points will be drawn in blue, off-curve points will be drawn in red.
 * @param {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
 * @param {string} text - The text to create.
 * @param {number} [x=0] - Horizontal position of the beginning of the text.
 * @param {number} [y=0] - Vertical position of the *baseline* of the text.
 * @param {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 * @param {GlyphRenderOptions=} options
 */Font.prototype.drawPoints=function(e,t,r,a,n,s){this.forEachGlyph(t,r,a,n,s,(function(t,r,a,n){t.drawPoints(e,r,a,n)}))};
/**
 * Draw lines indicating important font measurements for all glyphs in the text.
 * Black lines indicate the origin of the coordinate system (point 0,0).
 * Blue lines indicate the glyph bounding box.
 * Green line indicates the advance width of the glyph.
 * @param {CanvasRenderingContext2D} ctx - A 2D drawing context, like Canvas.
 * @param {string} text - The text to create.
 * @param {number} [x=0] - Horizontal position of the beginning of the text.
 * @param {number} [y=0] - Vertical position of the *baseline* of the text.
 * @param {number} [fontSize=72] - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`.
 * @param {GlyphRenderOptions=} options
 */Font.prototype.drawMetrics=function(e,t,r,a,n,s){this.forEachGlyph(t,r,a,n,s,(function(t,r,a,n){t.drawMetrics(e,r,a,n)}))};
/**
 * @param  {string}
 * @return {string}
 */Font.prototype.getEnglishName=function(e){var t=this.names[e];if(t)return t.en};Font.prototype.validate=function(){var e=this;function assert(e,t){}function assertNamePresent(t){var r=e.getEnglishName(t);assert(r&&r.trim().length>0)}assertNamePresent("fontFamily");assertNamePresent("weightName");assertNamePresent("manufacturer");assertNamePresent("copyright");assertNamePresent("version");assert(this.unitsPerEm>0)};Font.prototype.toTables=function(){return ne.fontToTable(this)};
/**
 * @deprecated Font.toBuffer is deprecated. Use Font.toArrayBuffer instead.
 */Font.prototype.toBuffer=function(){console.warn("Font.toBuffer is deprecated. Use Font.toArrayBuffer instead.");return this.toArrayBuffer()};Font.prototype.toArrayBuffer=function(){var e=this.toTables();var t=e.encode();var r=new ArrayBuffer(t.length);var a=new Uint8Array(r);for(var n=0;n<t.length;n++)a[n]=t[n];return r};Font.prototype.download=function(e){var t=this.getEnglishName("fontFamily");var r=this.getEnglishName("fontSubfamily");e=e||t.replace(/\s/g,"")+"-"+r+".otf";var a=this.toArrayBuffer();if(isBrowser()){window.URL=window.URL||window.webkitURL;if(window.URL){var n=new DataView(a);var s=new Blob([n],{type:"font/opentype"});var o=document.createElement("a");o.href=window.URL.createObjectURL(s);o.download=e;var i=document.createEvent("MouseEvents");i.initEvent("click",true,false);o.dispatchEvent(i)}else console.warn("Font file could not be downloaded. Try using a different browser.")}else{var u=require("fs");var l=arrayBufferToNodeBuffer(a);u.writeFileSync(e,l)}};Font.prototype.fsSelectionValues={ITALIC:1,UNDERSCORE:2,NEGATIVE:4,OUTLINED:8,STRIKEOUT:16,BOLD:32,REGULAR:64,USER_TYPO_METRICS:128,WWS:256,OBLIQUE:512};Font.prototype.usWidthClasses={ULTRA_CONDENSED:1,EXTRA_CONDENSED:2,CONDENSED:3,SEMI_CONDENSED:4,MEDIUM:5,SEMI_EXPANDED:6,EXPANDED:7,EXTRA_EXPANDED:8,ULTRA_EXPANDED:9};Font.prototype.usWeightClasses={THIN:100,EXTRA_LIGHT:200,LIGHT:300,NORMAL:400,MEDIUM:500,SEMI_BOLD:600,BOLD:700,EXTRA_BOLD:800,BLACK:900};function addName(e,t){var r=JSON.stringify(e);var a=256;for(var n in t){var s=parseInt(n);if(s&&!(s<256)){if(JSON.stringify(t[n])===r)return s;a<=s&&(a=s+1)}}t[a]=e;return a}function makeFvarAxis(e,t,r){var a=addName(t.name,r);return[{name:"tag_"+e,type:"TAG",value:t.tag},{name:"minValue_"+e,type:"FIXED",value:t.minValue<<16},{name:"defaultValue_"+e,type:"FIXED",value:t.defaultValue<<16},{name:"maxValue_"+e,type:"FIXED",value:t.maxValue<<16},{name:"flags_"+e,type:"USHORT",value:0},{name:"nameID_"+e,type:"USHORT",value:a}]}function parseFvarAxis(e,t,r){var a={};var n=new U.Parser(e,t);a.tag=n.parseTag();a.minValue=n.parseFixed();a.defaultValue=n.parseFixed();a.maxValue=n.parseFixed();n.skip("uShort",1);a.name=r[n.parseUShort()]||{};return a}function makeFvarInstance(e,t,r,a){var n=addName(t.name,a);var s=[{name:"nameID_"+e,type:"USHORT",value:n},{name:"flags_"+e,type:"USHORT",value:0}];for(var o=0;o<r.length;++o){var i=r[o].tag;s.push({name:"axis_"+e+" "+i,type:"FIXED",value:t.coordinates[i]<<16})}return s}function parseFvarInstance(e,t,r,a){var n={};var s=new U.Parser(e,t);n.name=a[s.parseUShort()]||{};s.skip("uShort",1);n.coordinates={};for(var o=0;o<r.length;++o)n.coordinates[r[o].tag]=s.parseFixed();return n}function makeFvarTable(e,t){var r=new k.Table("fvar",[{name:"version",type:"ULONG",value:65536},{name:"offsetToData",type:"USHORT",value:0},{name:"countSizePairs",type:"USHORT",value:2},{name:"axisCount",type:"USHORT",value:e.axes.length},{name:"axisSize",type:"USHORT",value:20},{name:"instanceCount",type:"USHORT",value:e.instances.length},{name:"instanceSize",type:"USHORT",value:4+4*e.axes.length}]);r.offsetToData=r.sizeOf();for(var a=0;a<e.axes.length;a++)r.fields=r.fields.concat(makeFvarAxis(a,e.axes[a],t));for(var n=0;n<e.instances.length;n++)r.fields=r.fields.concat(makeFvarInstance(n,e.instances[n],e.axes,t));return r}function parseFvarTable(e,t,r){var a=new U.Parser(e,t);var n=a.parseULong();v.argument(65536===n,"Unsupported fvar table version.");var s=a.parseOffset16();a.skip("uShort",1);var o=a.parseUShort();var i=a.parseUShort();var u=a.parseUShort();var l=a.parseUShort();var p=[];for(var c=0;c<o;c++)p.push(parseFvarAxis(e,t+s+c*i,r));var h=[];var f=t+s+o*i;for(var d=0;d<u;d++)h.push(parseFvarInstance(e,f+d*l,p,r));return{axes:p,instances:h}}var ye={make:makeFvarTable,parse:parseFvarTable};var attachList=function(){return{coverage:this.parsePointer(Parser.coverage),attachPoints:this.parseList(Parser.pointer(Parser.uShortList))}};var caretValue=function(){var e=this.parseUShort();v.argument(1===e||2===e||3===e,"Unsupported CaretValue table version.");return 1===e?{coordinate:this.parseShort()}:2===e?{pointindex:this.parseShort()}:3===e?{coordinate:this.parseShort()}:void 0};var ligGlyph=function(){return this.parseList(Parser.pointer(caretValue))};var ligCaretList=function(){return{coverage:this.parsePointer(Parser.coverage),ligGlyphs:this.parseList(Parser.pointer(ligGlyph))}};var markGlyphSets=function(){this.parseUShort();return this.parseList(Parser.pointer(Parser.coverage))};function parseGDEFTable(e,t){t=t||0;var r=new Parser(e,t);var a=r.parseVersion(1);v.argument(1===a||1.2===a||1.3===a,"Unsupported GDEF table version.");var n={version:a,classDef:r.parsePointer(Parser.classDef),attachList:r.parsePointer(attachList),ligCaretList:r.parsePointer(ligCaretList),markAttachClassDef:r.parsePointer(Parser.classDef)};a>=1.2&&(n.markGlyphSets=r.parsePointer(markGlyphSets));return n}var be={parse:parseGDEFTable};var Se=new Array(10);Se[1]=function parseLookup1(){var e=this.offset+this.relativeOffset;var t=this.parseUShort();if(1===t)return{posFormat:1,coverage:this.parsePointer(Parser.coverage),value:this.parseValueRecord()};if(2===t)return{posFormat:2,coverage:this.parsePointer(Parser.coverage),values:this.parseValueRecordList()};v.assert(false,"0x"+e.toString(16)+": GPOS lookup type 1 format must be 1 or 2.")};Se[2]=function parseLookup2(){var e=this.offset+this.relativeOffset;var t=this.parseUShort();v.assert(1===t||2===t,"0x"+e.toString(16)+": GPOS lookup type 2 format must be 1 or 2.");var r=this.parsePointer(Parser.coverage);var a=this.parseUShort();var n=this.parseUShort();if(1===t)return{posFormat:t,coverage:r,valueFormat1:a,valueFormat2:n,pairSets:this.parseList(Parser.pointer(Parser.list((function(){return{secondGlyph:this.parseUShort(),value1:this.parseValueRecord(a),value2:this.parseValueRecord(n)}}))))};if(2===t){var s=this.parsePointer(Parser.classDef);var o=this.parsePointer(Parser.classDef);var i=this.parseUShort();var u=this.parseUShort();return{posFormat:t,coverage:r,valueFormat1:a,valueFormat2:n,classDef1:s,classDef2:o,class1Count:i,class2Count:u,classRecords:this.parseList(i,Parser.list(u,(function(){return{value1:this.parseValueRecord(a),value2:this.parseValueRecord(n)}})))}}};Se[3]=function parseLookup3(){return{error:"GPOS Lookup 3 not supported"}};Se[4]=function parseLookup4(){return{error:"GPOS Lookup 4 not supported"}};Se[5]=function parseLookup5(){return{error:"GPOS Lookup 5 not supported"}};Se[6]=function parseLookup6(){return{error:"GPOS Lookup 6 not supported"}};Se[7]=function parseLookup7(){return{error:"GPOS Lookup 7 not supported"}};Se[8]=function parseLookup8(){return{error:"GPOS Lookup 8 not supported"}};Se[9]=function parseLookup9(){return{error:"GPOS Lookup 9 not supported"}};function parseGposTable(e,t){t=t||0;var r=new Parser(e,t);var a=r.parseVersion(1);v.argument(1===a||1.1===a,"Unsupported GPOS table version "+a);return 1===a?{version:a,scripts:r.parseScriptList(),features:r.parseFeatureList(),lookups:r.parseLookupList(Se)}:{version:a,scripts:r.parseScriptList(),features:r.parseFeatureList(),lookups:r.parseLookupList(Se),variations:r.parseFeatureVariationsList()}}var xe=new Array(10);function makeGposTable(e){return new k.Table("GPOS",[{name:"version",type:"ULONG",value:65536},{name:"scripts",type:"TABLE",value:new k.ScriptList(e.scripts)},{name:"features",type:"TABLE",value:new k.FeatureList(e.features)},{name:"lookups",type:"TABLE",value:new k.LookupList(e.lookups,xe)}])}var Te={parse:parseGposTable,make:makeGposTable};function parseWindowsKernTable(e){var t={};e.skip("uShort");var r=e.parseUShort();v.argument(0===r,"Unsupported kern sub-table version.");e.skip("uShort",2);var a=e.parseUShort();e.skip("uShort",3);for(var n=0;n<a;n+=1){var s=e.parseUShort();var o=e.parseUShort();var i=e.parseShort();t[s+","+o]=i}return t}function parseMacKernTable(e){var t={};e.skip("uShort");var r=e.parseULong();r>1&&console.warn("Only the first kern subtable is supported.");e.skip("uLong");var a=e.parseUShort();var n=255&a;e.skip("uShort");if(0===n){var s=e.parseUShort();e.skip("uShort",3);for(var o=0;o<s;o+=1){var i=e.parseUShort();var u=e.parseUShort();var l=e.parseShort();t[i+","+u]=l}}return t}function parseKernTable(e,t){var r=new U.Parser(e,t);var a=r.parseUShort();if(0===a)return parseWindowsKernTable(r);if(1===a)return parseMacKernTable(r);throw new Error("Unsupported kern table version ("+a+").")}var ke={parse:parseKernTable};function parseLocaTable(e,t,r,a){var n=new U.Parser(e,t);var s=a?n.parseUShort:n.parseULong;var o=[];for(var i=0;i<r+1;i+=1){var u=s.call(n);a&&(u*=2);o.push(u)}return o}var Pe={parse:parseLocaTable};
/**
 * Loads a font from a file. The callback throws an error message as the first parameter if it fails
 * and the font as an ArrayBuffer in the second parameter if it succeeds.
 * @param  {string} path - The path of the file
 * @param  {Function} callback - The function to call when the font load completes
 */function loadFromFile(e,t){var r=require("fs");r.readFile(e,(function(e,r){if(e)return t(e.message);t(null,nodeBufferToArrayBuffer(r))}))}
/**
 * Loads a font from a URL. The callback throws an error message as the first parameter if it fails
 * and the font as an ArrayBuffer in the second parameter if it succeeds.
 * @param  {string} url - The URL of the font file.
 * @param  {Function} callback - The function to call when the font load completes
 */function loadFromUrl(e,t){var r=new XMLHttpRequest;r.open("get",e,true);r.responseType="arraybuffer";r.onload=function(){return r.response?t(null,r.response):t("Font could not be loaded: "+r.statusText)};r.onerror=function(){t("Font could not be loaded")};r.send()}
/**
 * Parses OpenType table entries.
 * @param  {DataView}
 * @param  {Number}
 * @return {Object[]}
 */function parseOpenTypeTableEntries(e,t){var r=[];var a=12;for(var n=0;n<t;n+=1){var s=U.getTag(e,a);var o=U.getULong(e,a+4);var i=U.getULong(e,a+8);var u=U.getULong(e,a+12);r.push({tag:s,checksum:o,offset:i,length:u,compression:false});a+=16}return r}
/**
 * Parses WOFF table entries.
 * @param  {DataView}
 * @param  {Number}
 * @return {Object[]}
 */function parseWOFFTableEntries(e,t){var r=[];var a=44;for(var n=0;n<t;n+=1){var s=U.getTag(e,a);var o=U.getULong(e,a+4);var i=U.getULong(e,a+8);var u=U.getULong(e,a+12);var l=void 0;l=i<u&&"WOFF";r.push({tag:s,offset:o,compression:l,compressedLength:i,length:u});a+=20}return r}
/**
 * @typedef TableData
 * @type Object
 * @property {DataView} data - The DataView
 * @property {number} offset - The data offset.
 */
/**
 * @param  {DataView}
 * @param  {Object}
 * @return {TableData}
 */function uncompressTable(e,t){if("WOFF"===t.compression){var r=new Uint8Array(e.buffer,t.offset+2,t.compressedLength-2);var a=new Uint8Array(t.length);h(r,a);if(a.byteLength!==t.length)throw new Error("Decompression error: "+t.tag+" decompressed length doesn't match recorded length");var n=new DataView(a.buffer,0);return{data:n,offset:0}}return{data:e,offset:t.offset}}
/**
 * Parse the OpenType file data (as an ArrayBuffer) and return a Font object.
 * Throws an error if the font could not be parsed.
 * @param  {ArrayBuffer}
 * @param  {Object} opt - options for parsing
 * @return {opentype.Font}
 */function parseBuffer(e,t){t=void 0===t||null===t?{}:t;var r;var a;var n=new Font({empty:true});var s=new DataView(e,0);var o;var i=[];var u=U.getTag(s,0);if(u===String.fromCharCode(0,1,0,0)||"true"===u||"typ1"===u){n.outlinesFormat="truetype";o=U.getUShort(s,4);i=parseOpenTypeTableEntries(s,o)}else if("OTTO"===u){n.outlinesFormat="cff";o=U.getUShort(s,4);i=parseOpenTypeTableEntries(s,o)}else{if("wOFF"!==u)throw new Error("Unsupported OpenType signature "+u);var l=U.getTag(s,4);if(l===String.fromCharCode(0,1,0,0))n.outlinesFormat="truetype";else{if("OTTO"!==l)throw new Error("Unsupported OpenType flavor "+u);n.outlinesFormat="cff"}o=U.getUShort(s,12);i=parseWOFFTableEntries(s,o)}var p;var c;var h;var v;var f;var d;var g;var m;var y;var b;var S;var x;for(var T=0;T<o;T+=1){var k=i[T];var P=void 0;switch(k.tag){case"cmap":P=uncompressTable(s,k);n.tables.cmap=C.parse(P.data,P.offset);n.encoding=new CmapEncoding(n.tables.cmap);break;case"cvt ":P=uncompressTable(s,k);x=new U.Parser(P.data,P.offset);n.tables.cvt=x.parseShortList(k.length/2);break;case"fvar":c=k;break;case"fpgm":P=uncompressTable(s,k);x=new U.Parser(P.data,P.offset);n.tables.fpgm=x.parseByteList(k.length);break;case"head":P=uncompressTable(s,k);n.tables.head=A.parse(P.data,P.offset);n.unitsPerEm=n.tables.head.unitsPerEm;r=n.tables.head.indexToLocFormat;break;case"hhea":P=uncompressTable(s,k);n.tables.hhea=B.parse(P.data,P.offset);n.ascender=n.tables.hhea.ascender;n.descender=n.tables.hhea.descender;n.numberOfHMetrics=n.tables.hhea.numberOfHMetrics;break;case"hmtx":g=k;break;case"ltag":P=uncompressTable(s,k);a=H.parse(P.data,P.offset);break;case"maxp":P=uncompressTable(s,k);n.tables.maxp=_.parse(P.data,P.offset);n.numGlyphs=n.tables.maxp.numGlyphs;break;case"name":b=k;break;case"OS/2":P=uncompressTable(s,k);n.tables.os2=K.parse(P.data,P.offset);break;case"post":P=uncompressTable(s,k);n.tables.post=J.parse(P.data,P.offset);n.glyphNames=new GlyphNames(n.tables.post);break;case"prep":P=uncompressTable(s,k);x=new U.Parser(P.data,P.offset);n.tables.prep=x.parseByteList(k.length);break;case"glyf":h=k;break;case"loca":y=k;break;case"CFF ":p=k;break;case"kern":m=k;break;case"GDEF":v=k;break;case"GPOS":f=k;break;case"GSUB":d=k;break;case"meta":S=k;break}}var R=uncompressTable(s,b);n.tables.name=Z.parse(R.data,R.offset,a);n.names=n.tables.name;if(h&&y){var L=0===r;var E=uncompressTable(s,y);var O=Pe.parse(E.data,E.offset,n.numGlyphs,L);var D=uncompressTable(s,h);n.glyphs=se.parse(D.data,D.offset,O,n,t)}else{if(!p)throw new Error("Font doesn't contain TrueType or CFF outlines.");var F=uncompressTable(s,p);G.parse(F.data,F.offset,n,t)}var w=uncompressTable(s,g);N.parse(n,w.data,w.offset,n.numberOfHMetrics,n.numGlyphs,n.glyphs,t);addGlyphNames(n,t);if(m){var I=uncompressTable(s,m);n.kerningPairs=ke.parse(I.data,I.offset)}else n.kerningPairs={};if(v){var M=uncompressTable(s,v);n.tables.gdef=be.parse(M.data,M.offset)}if(f){var z=uncompressTable(s,f);n.tables.gpos=Te.parse(z.data,z.offset);n.position.init()}if(d){var W=uncompressTable(s,d);n.tables.gsub=re.parse(W.data,W.offset)}if(c){var V=uncompressTable(s,c);n.tables.fvar=ye.parse(V.data,V.offset,n.names)}if(S){var q=uncompressTable(s,S);n.tables.meta=ae.parse(q.data,q.offset);n.metas=n.tables.meta}return n}
/**
 * Asynchronously load the font from a URL or a filesystem. When done, call the callback
 * with two arguments `(err, font)`. The `err` will be null on success,
 * the `font` is a Font object.
 * We use the node.js callback convention so that
 * opentype.js can integrate with frameworks like async.js.
 * @alias opentype.load
 * @param  {string} url - The URL of the font to load.
 * @param  {Function} callback - The callback.
 */function load(e,t,r){r=void 0===r||null===r?{}:r;var a="undefined"===typeof window;var n=a&&!r.isUrl?loadFromFile:loadFromUrl;return new Promise((function(a,s){n(e,(function(e,n){if(e){if(t)return t(e);s(e)}var o;try{o=parseBuffer(n,r)}catch(e){if(t)return t(e,null);s(e)}if(t)return t(null,o);a(o)}))}))}
/**
 * Synchronously load the font from a URL or file.
 * When done, returns the font object or throws an error.
 * @alias opentype.loadSync
 * @param  {string} url - The URL of the font to load.
 * @param  {Object} opt - opt.lowMemory
 * @return {opentype.Font}
 */function loadSync(e,t){var r=require("fs");var a=r.readFileSync(e);return parseBuffer(nodeBufferToArrayBuffer(a),t)}var Re=Object.freeze({__proto__:null,Font:Font,Glyph:Glyph,Path:Path,BoundingBox:BoundingBox,_parse:U,parse:parseBuffer,load:load,loadSync:loadSync});export{BoundingBox,Font,Glyph,Path,U as _parse,Re as default,load,loadSync,parseBuffer as parse};

//# sourceMappingURL=opentype.module.js.map