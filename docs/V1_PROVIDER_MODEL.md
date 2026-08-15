# V1 Provider Model

## Provider Neutrality

The review engine does not contain provider-specific review logic. Provider adapters expose:

- invoke
- optional stream
- capabilities
- optional cost estimate
- health

## Routing

Routing is task-based and considers:

- task type
- risk level
- repository language
- changed surface
- context size
- vision need
- browser artifacts
- previous confidence
- budget
- latency preference
- provider health

Review logic must not branch on literal model names.

## Capability Detection

Providers and models declare capabilities:

- coding reasoning
- architecture reasoning
- security reasoning
- long context
- tool use
- vision
- latency class
- cost class
- context window
- structured output
- reliability score

Unsupported proprietary features are optional, not assumed.

## Privacy

Default behavior must clearly indicate when source code may leave the machine. Local/offline mode remains a first-class policy.

## V1 Strategy Rule

The winning model strategy is selected by eval outcome, latency, and cost. Multi-model verification is retained only if it materially improves precision/recall or reduces high-risk false positives.
