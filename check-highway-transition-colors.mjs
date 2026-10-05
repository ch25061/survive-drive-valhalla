import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('dist/app.js','utf8');
const html=readFileSync('dist/index.html','utf8');
const css=readFileSync('dist/style.css','utf8');

assert.match(app,/for\(const \[offset,label\]of \[\[entry,'IN'\],\[exit,'OUT'\]\][\s\S]*?setAttribute\('fill',label==='IN'\?'#fff':'#000'\)[\s\S]*?setAttribute\('stroke',label==='IN'\?'#111':'#fff'\)/,'mapped highway run entrances render as white dots and exits as black dots');
assert.match(app,/transition\.kind==='entry'\?'#fff':'#000'[\s\S]*?transition\.kind==='entry'\?'#111':'#fff'/,'approximate Valhalla guidance points use the same entrance/exit colors');
assert.match(app,/\[\[entry,'entry \/ reentry'\],\[exit,'exit to overland streets'\]\][\s\S]*?color:offset===entry\?'#111':'#fff'[\s\S]*?fillColor:offset===entry\?'#fff':'#000'/,'the interactive map colors mapped entrances white and exits black');
assert.match(app,/color:transition\.kind==='entry'\?'#111':'#fff'[\s\S]*?fillColor:transition\.kind==='entry'\?'#fff':'#000'/,'the interactive map colors approximate guidance entrances white and exits black');
assert.match(html,/highway-entry-dot"><\/b>Highway entrance[\s\S]*?highway-exit-dot"><\/b>Highway exit/,'the map legend identifies separate entrance and exit dots');
assert.match(css,/\.highway-transition-dot\{[^}]*background:#fff[^}]*\}\.highway-exit-dot\{background:#000;border-color:#fff\}/,'legend swatches use a white entrance and black exit dot');

console.log('Passed highway transition colors: entrance markers/swatches are white; exit markers/swatches are black.');
