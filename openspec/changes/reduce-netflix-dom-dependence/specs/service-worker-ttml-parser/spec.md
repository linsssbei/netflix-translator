## ADDED Requirements

### Requirement: Regex parser as default TTML path
The `parseTtml()` function SHALL use the regex-based parser (`parseTtmlWithRegex()`) as its default parsing path in all contexts, regardless of whether `DOMParser` is available. The `DOMParser` path SHALL be available as an opt-in fallback for environments that want XML validation.

#### Scenario: Parsing TTML when DOMParser is available
- **WHEN** `parseTtml()` is called with a TTML payload in a browser context where `DOMParser` exists
- **THEN** the function SHALL use `parseTtmlWithRegex()` by default

#### Scenario: Parsing TTML in service worker
- **WHEN** `parseTtml()` is called in a service worker context where `DOMParser` is unavailable
- **THEN** the function SHALL use `parseTtmlWithRegex()` identically to the browser context, producing the same output

#### Scenario: Opt-in XML validation
- **WHEN** a caller explicitly requests XML validation (e.g., via an options parameter)
- **THEN** `parseTtml()` MAY fall back to `DOMParser` for validation-only purposes, but the parsed output SHALL match `parseTtmlWithRegex()`

### Requirement: Complete entity decoding in regex parser
The regex parser SHALL decode all standard XML entities and numeric character references in subtitle text content, matching the behavior of `DOMParser` + `node.textContent`.

#### Scenario: Standard XML entities
- **WHEN** TTML text contains `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, or `&#39;`
- **THEN** the regex parser SHALL decode them to their respective characters (`&`, `<`, `>`, `"`, `'`, `'`)

#### Scenario: Decimal numeric character references
- **WHEN** TTML text contains `&#NNN;` (e.g., `&#160;` for non-breaking space, `&#8230;` for ellipsis)
- **THEN** the regex parser SHALL decode them to the corresponding Unicode character

#### Scenario: Hexadecimal numeric character references
- **WHEN** TTML text contains `&#xHHH;` (e.g., `&#x2014;` for em dash)
- **THEN** the regex parser SHALL decode them to the corresponding Unicode character

### Requirement: Parser parity tests
The system SHALL include test coverage proving that `parseTtmlWithRegex()` and the `DOMParser` path produce identical output for the same TTML inputs covering all Netflix-relevant payload shapes.

#### Scenario: Basic TTML with begin/end timing
- **WHEN** a TTML payload with `<p begin="0:00:01.000" end="0:00:04.000">Hello</p>` is parsed
- **THEN** both parser paths SHALL output a segment with `startMs: 1000`, `endMs: 4000`, `sourceText: "Hello"`

#### Scenario: TTML with `<br/>` and nested `<span>`
- **WHEN** a TTML payload contains `<p begin="0:00:01.000" end="0:00:04.000">Line one<br/>Line <span>two</span></p>`
- **THEN** both parser paths SHALL produce `sourceText: "Line one\nLine two"`

#### Scenario: TTML with `dur` attribute
- **WHEN** a TTML payload contains `<p begin="0:00:15.000" dur="5.000s">Duration</p>`
- **THEN** both parser paths SHALL produce a segment with `startMs: 15000`, `endMs: 20000`

#### Scenario: TTML with `ttp:tickRate`
- **WHEN** a TTML payload contains `ttp:tickRate="10000000"` and `<p begin="465882084t" end="485882084t">Ticks</p>`
- **THEN** both parser paths SHALL produce a segment with `startMs: 46588`, `endMs: 48588`

### Requirement: Fixture coverage for Netflix TTML shapes
The system SHALL have TTML test fixtures covering: default namespace, `<br>` line breaks, nested `<span>` elements, tick-based timing, `dur` attribute, escaped entities, and malformed payloads.

#### Scenario: Fixture coverage completeness
- **WHEN** the test suite runs
- **THEN** each fixture SHALL be parsed by both `parseTtml()` and `parseTtmlWithRegex()`, and their outputs SHALL match segment count, timing values, and source text