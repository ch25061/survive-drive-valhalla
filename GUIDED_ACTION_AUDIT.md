# Guided menu action survey

Guided choices reuse the existing guarded controls. All manual buttons remain available. A direct choice executes only after current menu readiness and the real control's disabled/ARIA-disabled state are checked again.

## Direct one-step actions

| Choice | Existing control and result |
| --- | --- |
| Save my work | Export the current session to a local download. |
| Check the road connection | Run the connection check; this explicit check does not resume a pending route search. |
| Use the smaller Start/Destination gate set | Accept the currently offered limited set; does not generate routes. |
| Save my cell review | Save the entered assessment/note; unavailable until there is input to save. |
| Look at available street photos | Open the existing ready Google Street View link. |
| Show Route Family presentation / Return to ranked list | Switch presentation and bring cards into view. |
| End this comparison | Clear comparison selections/overlay; retain the selected route and recorded choice. |
| Show/Hide white turn bubbles | Toggle current visibility. |
| Calculate the exact extra lookup count | Calculate from current settings with a free cache check; paid lookups still require separate approval. This choice disappears when a plan already exists, and disabled calculation controls cannot execute. |
| Record the selected route as my choice | Activate the existing endpoint-validated choice control. |
| Send my recorded route to the phone | Activate the existing QR/phone-link preparation button for the recorded route. |
| Review Android phone setup | Open the existing setup link. |

Map-pin choices already arm placement directly, without a second arm-button click. The user still places the pin. Stage choices already change workflow stages directly.

## Input and review navigation

| Choices | Why they remain navigation |
| --- | --- |
| Address / repair address | Need address and ZIP input. |
| Place or move pin | Arm placement, then need the user's map click. |
| Generate/regenerate gates | Need an opportunity to review four gate parameters before GO. |
| Review a paused gate search | Requires the failure report and separate retry decision. |
| Find routes | Requires opportunity to review road preferences, time limit, gates and exclusion settings before running a search. |
| Set longest drive / review exclusion areas | Need user parameter input. |
| Review gates / returned route / comparison map | The requested result is a view of the map. |
| Read search report / see progress | The requested result is the report or status. |
| Review trip settings / open ranking step / change trip | Navigate to the workflow stage for the user's decisions. |
| Examine routes / choose routes to compare | Need the user's route selection or comparison checkmarks. |
| Adjust family rules / route scoring | Need the user's settings. |
| Review selected cell / look around | Need an assessment, observation, cell, or inspection-point decision. |
| Undo an overly aggressive cull | Need the user's replacement inclusion target before Reset. |
| Decide evidence count / choose evidence routes | Need the user's count and inclusion decisions. |
| Review pending lookup plan | Review and explicit approval remain separate; never infer a paid Run click. |

## Verification

The branch matrix covers setup, partial/limited gates, waiting and stopped searches, ranking, selected cells, prepared plans, comparisons, and recorded routes. Stale disabled controls cannot be activated. Execution checks use saved routes in isolated previews and postpublication verification; live provider calls are not needed for these menu changes.

Account creation, billing prices and email delivery are a separate workstream. This menu update introduces no new charges.
