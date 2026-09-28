import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('dist/app.js','utf8');
const css=readFileSync('dist/style.css','utf8');
const html=readFileSync('dist/index.html','utf8');

assert.match(html,/id="origin-name" value=""/,'a new trip must start without the old origin');
assert.match(html,/id="origin" value=""/,'a new trip must start without old origin coordinates');
assert.match(html,/id="destination-name" value=""/,'a new trip must start without the old destination');
assert.match(html,/id="destination" value=""/,'a new trip must start without old destination coordinates');
assert.match(html,/id="route-descriptor"[^>]*>Set a start and destination to begin</);
assert.match(html,/id="candidate-title">No trip yet</);
assert.match(html,/id="fit-map"[^>]*disabled/);
assert.match(html,/id="trip-endpoints"[\s\S]*id="pick-origin"[^>]*class="primary"[\s\S]*id="pick-destination"[^>]*class="primary"/,'the first endpoint actions must be strongly green');
assert.doesNotMatch(html,/Lincoln Square, Chicago|55th & Western, Chicago|Existing Route 5 loaded/,'ordinary startup must not carry the previous trip');
assert.match(app,/async function init\(\)[\s\S]*reference=await response\.json\(\);await loadBundledIntersectionCatalog\(\);renderCandidates\(\);drawMap\(\{fitBounds:true\}\)/,'startup may load reference metadata but must not activate its routes');
assert.doesNotMatch(app,/reference=await response\.json\(\);state\.routes=reference\.routes/,'startup must not install the bundled route as the current trip');
assert.match(html,/id="selected-route-popup"[^>]*hidden[\s\S]*role="dialog"[^>]*aria-modal="true"/,'selected-route AVM work must begin in a hidden focused popup');
assert.match(app,/button\.addEventListener\('click',\(\)=>handleCandidateCardClick\(i\)\)/,'route cards share one pointer and keyboard activation path');
assert.match(app,/if\(index!==state\.active\|\|state\.candidateCardArmedRouteId!==route\.id\)\{const selected=selectRoute\(index,\{source:'candidate-card'\}\);if\(selected\)state\.candidateCardArmedRouteId=route\.id;return selected;\}/,'the first deliberate activation selects and displays a route while arming its second click');
assert.match(app,/if\(!poolScreenReady\(\)\)return false;\s*state\.selectedRoutePopupOpen=true/,'only the second deliberate activation opens follow-up after the whole-pool screen is ready');
assert.match(app,/function closeSelectedRoutePopup\(\)\{state\.selectedRoutePopupOpen=false;\$\('selected-route-popup'\)\.hidden=true;updateNextAction\(\);\}/,'closing must preserve selection and send nothing');
assert.match(css,/\.selected-route-popup\{[^}]*position:fixed[^}]*z-index:2000/,'the route follow-up must be a focused overlay');

assert.match(html,/Required: Shotgun Escape Gates/,
  'the preparation flow should identify Shotgun gates as required');
assert.match(html,/Prepare mandatory Shotgun batch/,
  'the only route-search preparation action should name the mandatory batch');
assert.doesNotMatch(html,/Prepare a search round/,
  'the deprecated standalone search action must not remain visible');
assert.doesNotMatch(html,/shotgun-catalog-file|Major-intersection catalog/,
  'the user-facing regional-catalog upload control must be removed');
assert.match(app,/fetch\('intersection-catalog-chicago-v1\.json'\)/,
  'the built-in catalog should still load automatically');
assert.match(app,/fetch\('\/api\/intersections\/lookup'/,
  'regional coverage should still use the approved automatic Census page-fault flow');
assert.match(html,/id="shotgun-outer"[^>]*max="5"/,
  'the outer-radius control should match the five-mile regional catalog limit');
assert.match(html,/To widen the search band, keep the inner radius where it is and raise only the outer radius/,
  'the radius controls should explain how to widen the band');
assert.match(app,/Old gate markers were removed until coverage is verified/,
  'incomplete coverage should clear old gate markers before a page-fault check');
assert.doesNotMatch(app,/shotgun-catalog-file/,
  'the removed file picker must not remain wired into the UI');
assert.match(app,/if\(!state\.shotgunSuggestions\)throw Error\('Prepare and review Start Escape Gates/,
  'draft preparation should require current start-gate suggestions');
assert.match(app,/if\(!state\.destinationShotgunSuggestions\)throw Error\('Prepare and review Destination Approach Gates/,
  'draft preparation should require current destination-gate suggestions');
assert.match(app,/deprecated_standalone_search_blocked/,
  'a draft without a mandatory Shotgun batch should be rejected before sending');
assert.match(html,/id="accept-limited-shotgun"[\s\S]*id="accept-limited-shotgun-destination"/,
  'start and destination shortfalls should each have an explicit limited-set acceptance');
assert.match(html,/id="prepare-shotgun-batch"[^>]*disabled/,
  'batch preparation should remain disabled until both gate decisions are resolved');
assert.match(app,/if\(!gateResolutionReady\('start'\)\)throw Error\('Find the requested number of Start Escape Gates/,
  'a start-gate shortfall should block draft preparation until explicitly accepted');
assert.match(app,/if\(!gateResolutionReady\('destination'\)\)throw Error\('Find the requested number of Destination Approach Gates/,
  'a destination-gate shortfall should block draft preparation until explicitly accepted');
assert.match(css,/\.gate-resolution\{[^}]*border:2px solid #a66f00/,
  'an unresolved shortfall should be visually prominent');
assert.match(css,/\.gate-resolution\.accepted\{[^}]*border-color:#168044/,
  'an accepted limited set should have a distinct resolved treatment');

assert.match(app,/routeLayer=L\.polyline\([^\n]+\{color:'#00aaff',weight:6,opacity:\.62\}/,
  'the Leaflet candidate route should be translucent enough to reveal map labels');
assert.match(app,/line\.setAttribute\('stroke','#00aaff'\);line\.setAttribute\('stroke-width','4'\);line\.setAttribute\('stroke-opacity','\.62'\)/,
  'the fallback route should use the same translucent blue treatment');
assert.match(app,/highway=L\.polyline\([^\n]+\{color:'#197a30',weight:10,opacity:\.78/,
  'highway-authority overlays should retain their stronger independent emphasis');
assert.match(css,/\.line-key\{[^}]*background:#00aaff;opacity:\.62;/,
  'the route legend should preview the translucent route style');

assert.match(css,/\.next-action-target\{[^}]*background-color:#008b3d!important;[^}]*color:#fff!important;[^}]*border-color:#006f30!important;/,
  'every dynamically selected next control should receive a strong green treatment');
assert.match(css,/\.primary\{[^}]*background:#008b3d;[^}]*color:white;[^}]*border:3px solid #006f30/,
  'primary user actions should use the strong green guidance treatment');
assert.match(css,/#send-here:not\(:disabled\),#send-here\.next-action-target:not\(:disabled\)\{[^}]*background:#008b3d!important;[^}]*color:#fff!important;[^}]*opacity:1!important/,
  'the enabled final HERE approval should stay unmistakably green');
assert.match(css,/#pool-screening-budget\.next-action-target,\.next-action-target #pool-screening-budget\{[^}]*background-color:#008b3d!important;[^}]*color:#fff!important;[^}]*border:3px solid #006f30!important/,
  'the expected whole-pool AVM budget field should be unmistakably green');
assert.match(css,/\.candidate-list\{[^}]*cursor:grab/,
  'the candidate strip should advertise drag scrolling');
assert.match(css,/\.candidate-list\.is-grabbed,\.candidate-list\.is-dragging[^}]*cursor:grabbing/,
  'the candidate strip should advertise active drag scrolling');
assert.match(css,/\.candidate-list::-webkit-scrollbar\{height:16px\}/,
  'the horizontal scrollbar should have a larger pointer target');
assert.match(css,/\.candidate-list\{[^}]*scrollbar-width:auto/,
  'the ranking strip should use a full-size native scrollbar where supported');
assert.match(css,/\.next-action-modifier\{[^}]*background-color:rgba\(255,190,0,\.3\)!important;[^}]*border-color:#a66f00!important;/,
  'parameters that affect the next action should remain yellow');
assert.match(css,/\.next-action-scope\{[^}]*outline:4px solid #7138c9!important;/,
  'the action and its modifiers should remain enclosed by a strong purple boundary');
assert.match(html,/id="here-approval-panel"[^>]*aria-label="HERE approval and request budget"[\s\S]*id="here-key"[\s\S]*id="send-here"/,
  'the full HERE request, budget, key, and approval controls must share one guided viewport group');
assert.match(css,/\.next-action-pointer\{[^}]*background:#ffe36d[^}]*pointer-events:none/,
  'the current action needs a conspicuous non-interactive yellow pointing finger');
assert.match(app,/guidedApprovalScroll\(fallback\)/,
  'the mandatory HERE approval cue must scroll its complete post-render group');
assert.match(app,/window\.addEventListener\('resize'/,
  'guidance must refresh and follow the current action when responsive layout changes');
assert.match(app,/trip-form'\)\.addEventListener\('submit',[\s\S]*finally\{updateNextAction\(\);\}/,
  'keyboard form-submit validation must refresh persistent Next guidance');
assert.match(app,/if\(screen\.plan\)choose\('#approve-pool-screening'/,
  'a prepared pool plan should guide the user to its approval control');
assert.match(app,/screen\.budget<1\)choose\('#pool-screening-budget'/,
  'a zero ceiling after ranking review should make the AVM budget the next green decision');
assert.match(app,/screen\.results\.length&&screen\.budget>0&&!screen\.plan&&poolRankingReviewPresented\(\)&&\[[^\]]*'complete'[^\]]*\]\.includes\(screen\.status\)\)choose\('#prepare-pool-evolution-ranking'/,
  'a next evolutionary generation should only be highlighted after the ranking review checkpoint is presented');
assert.match(app,/state\.draft\?\.here\?\.status==='shotgun_batch_prepared_not_authorized_or_sent'&&!!state\.draft\?\.shotgun\?\.batch/,
  'only a prepared paired-gate batch should select the final HERE approval as the next action');
assert.match(app,/\$\('shotgun-settings'\)\?\.addEventListener\('toggle'/,
  'opening the escape-gate disclosure should immediately refresh its expected next action');
assert.doesNotMatch(app,/\$\('pool-screening-section'\)\?\.addEventListener\('toggle'/,
  'required pool screening must not depend on opening a disclosure');
assert.match(app,/else if\(!poolScreenReady\(\)\)choose\('#prepare-pool-screening'/,
  'Evaluate should direct users to prepare the whole-pool screen until screening is complete');
assert.doesNotMatch(app,/Check available evidence|Evaluate selected route/,
  'the selected-route evidence-only shortcut must not return');
assert.match(app,/Click to select a cell for AVM and review · Double-click to open Street View/,
  'the runtime map instruction should explain that a picked cell becomes a review target');
assert.doesNotMatch(app,/Click to place an inspection marker · Double-click to open Street View/,
  'the old marker-only instruction must not overwrite the picked-cell review guidance');

console.log('Passed strong-green expected actions, yellow modifiers, purple action scopes, pool-evolution guidance, and translucent blue route overlays. No provider calls.');
