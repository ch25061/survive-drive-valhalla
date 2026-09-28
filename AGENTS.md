# Survive Drive development baseline

- Use this Valhalla repository's `main` branch as the starting point for future Survive Drive work. The user promoted it to the primary development baseline on September 28, 2026.
- Keep the HERE version and its `choppy.fans` deployment separate. Do not replace that public address merely because this repository is now the development baseline.
- Preserve Escape Gates and the full start/destination gate cross product unless the user changes that requirement.
- Before new AVM sampling, run Round 0 on known coverage: protect routes below 20%, then exclude the lowest-coverage `ceil(40%)` of unprotected routes. Apply the cell count per route. Keep exact provider ceilings and no automatic retries.
- After each completed evidence reranking, mark the top `ceil(30%)` of the entire candidate pool INCLUDED for the next evidence round. Previously excluded routes may return when their rank improves. Round 0's initial protection and cull happen before this recurring rule.
- Build and verify changes offline before publishing the Valhalla Site. Do not send live provider requests solely to test code.
