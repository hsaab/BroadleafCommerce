---
name: legacy-java-to-ts-service
description: Extract legacy Java business capabilities into Node.js/TypeScript services with behavior parity, service-boundary discipline, API contract tests, runtime smoke checks, and optional thin Java adapters. Use when modernizing Broadleaf Java services, providers, workflows, or controllers into a separate TypeScript service.
---

# Legacy Java To TypeScript Service

## Goal

Deliver a focused vertical slice for one extracted Java capability: source-of-truth analysis, TypeScript service, contract tests, runtime endpoint proof, and an optional note for future adapter/UI integration.

## Start Here

1. Restate the named capability and demo-critical proof path.
2. Apply `service-extraction-boundary`, `legacy-behavior-source`, and `service-contract-testing` rules.
3. Create or switch to a dedicated feature branch before implementation edits.
4. Before editing, summarize likely files/directories to touch and verification commands.

## Required Subagent Sequence

Launch the read-only analysis agents in parallel when possible:

1. `legacy-behavior-investigator`
   - Identify source-of-truth Java classes, tests, behavior rules, and edge cases.
2. `api-contract-designer`
   - Propose endpoints, DTOs, response/error shapes, and example payloads.
3. `test-migration-agent`
   - Map legacy tests to service API/contract tests.
4. `adapter-planner`
   - Use only when the user explicitly asks for adapter work. Otherwise, record what future adapter seam would be likely without implementing it.

## Plan Mode Checkpoint

After investigation is complete, synthesize the subagent results into a short implementation plan and switch to Plan mode before coding.

- Call `SwitchMode` with `target_mode_id: "plan"` after the source-of-truth, contract, and test-mapping findings are known.
- In Plan mode, present the extracted boundary, proposed files, endpoint contract, test coverage, verification commands, and adapter/UI scope decision.
- Do not start implementation edits until the plan is accepted and the conversation is back in Agent mode.

## Implementation Loop

1. Create the smallest TypeScript service that proves the extracted capability.
2. Keep business logic modular and independent from Broadleaf entities.
3. Add contract/API tests derived from legacy behavior before broadening scope.
4. Run the narrowest service test command first.
5. Fix only failures related to the extracted capability.
6. Do not move unrelated catalog, cart, checkout, payment, tax, inventory, product, or SKU ownership.

## Proof Order

1. API/contract tests pass.
2. Run `service-runtime-smoke` as the final service proof:
   - Start or verify the local service.
   - Hit health and primary business endpoints.
   - Report status codes and key response fields.
3. If a demo app is involved, verify it only as baseline/context unless the user explicitly asked for adapter integration.
4. Do not claim the demo app is powered by the new service unless an adapter was actually implemented and verified.

## Shipping Pilot Defaults

When the named capability is shipping estimation:

- Source of truth: Broadleaf fulfillment pricing providers and fulfillment pricing tests.
- Service owns: fulfillment/shipping estimate calculation, band validation, and explain responses.
- Broadleaf keeps: catalog, cart, checkout, payment, tax, inventory, products, and SKUs.
- `demosite` role: baseline visual context and final "still works" smoke only.
- Out of scope for the first pilot: wiring `demosite` checkout to the new service.
- Final demo proof: API tests plus endpoint smoke evidence; then show `demosite` still runs separately.

## Final Handoff

Use this format:

```markdown
## Extracted Capability
[Capability and new service boundary.]

## Source Of Truth
- [Legacy classes/tests read]

## Contract Proof
- `[command]`: [result]
- Endpoint smoke: [request/response summary]

## Adapter/UI Status
[Implemented, planned, or intentionally skipped.]

## Demo Script
1. Show legacy behavior.
2. Show extracted service contract.
3. Show API tests/runtime smoke.
4. Show app smoke or adapter plan.

## Risks
- [Remaining risk or "None found"]
```
