# Survive Drive development baseline

- Use this Valhalla repository's `main` branch as the starting point for future Survive Drive work. The user promoted it to the primary development baseline on September 28, 2026.
- Keep the HERE version and its `choppy.fans` deployment separate. Do not replace that public address merely because this repository is now the development baseline.
- Preserve Escape Gates and the full start/destination gate cross product unless the user changes that requirement.
- Before new AVM sampling, run Round 0 on known coverage. Its nominal INCLUDED quota is `ceil(N/3)` from the original `N` candidates, but protect every route below 20% known coverage even if this exceeds the quota. Apply the cell count only to INCLUDED routes. Keep exact provider ceilings and no automatic retries.
- After each completed evidence reranking, advance the cull number and fill `ceil(N/3^cull_number)` INCLUDED slots from the full current ranking. Prior inclusion does not reserve a slot; previously EXCLUDED routes can be promoted. A reranking without a completed evidence round substitutes routes within the current quota without shrinking it.
- Build and verify changes offline before publishing the Valhalla Site. Do not send live provider requests solely to test code.
