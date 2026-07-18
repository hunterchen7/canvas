package main

import (
	"encoding/json"
	"testing"
)

func number(value string) json.Number {
	return json.Number(value)
}

func TestComparePairedSamplesClassifiesImprovement(t *testing.T) {
	result := comparePairedSamples(request{
		Baseline:  []any{number("10"), number("20"), number("30"), number("40"), number("50")},
		Candidate: []any{number("9"), number("18"), number("27"), number("36"), number("45")},
		Options: map[string]any{
			"bootstrapIterations": number("100"),
			"seed":                "smoke",
		},
	})

	if result.Classification != "improvement" {
		t.Fatalf("classification = %q, want improvement", result.Classification)
	}
	if result.Bootstrap95.AbsoluteDelta.Seed != 1_611_018_502 {
		t.Fatalf("seed = %d, want TypeScript-compatible FNV seed", result.Bootstrap95.AbsoluteDelta.Seed)
	}
	if result.Bootstrap95.AbsoluteDelta.Lower == nil || *result.Bootstrap95.AbsoluteDelta.Lower != -5 {
		t.Fatalf("lower confidence bound = %v, want -5", result.Bootstrap95.AbsoluteDelta.Lower)
	}
	if result.Bootstrap95.AbsoluteDelta.Upper == nil || *result.Bootstrap95.AbsoluteDelta.Upper != -1 {
		t.Fatalf("upper confidence bound = %v, want -1", result.Bootstrap95.AbsoluteDelta.Upper)
	}
}

func TestComparePairedSamplesPreservesMissingAndZeroSemantics(t *testing.T) {
	result := comparePairedSamples(request{
		Baseline:  []any{number("0"), nil, number("-10"), "not-a-number"},
		Candidate: []any{number("0"), number("2"), number("-5"), number("3")},
		Options: map[string]any{
			"bootstrapIterations": number("25"),
			"lowerIsBetter":       nil,
			"minimumPairs":        number("1"),
		},
	})

	if result.InputPairCount != 4 || result.PairCount != 2 || result.MissingPairCount != 2 {
		t.Fatalf("pair counts = %d/%d/%d, want 4/2/2", result.InputPairCount, result.PairCount, result.MissingPairCount)
	}
	if result.LowerIsBetter != nil || result.Classification != "not-classified" {
		t.Fatalf("direction/classification = %v/%q, want nil/not-classified", result.LowerIsBetter, result.Classification)
	}
	if result.PercentDeltaUnavailableCount != 0 {
		t.Fatalf("unavailable percentages = %d, want 0", result.PercentDeltaUnavailableCount)
	}
	if result.Pairs[0].PercentDelta == nil || *result.Pairs[0].PercentDelta != 0 {
		t.Fatalf("0 -> 0 percentage = %v, want 0", result.Pairs[0].PercentDelta)
	}
}

func TestHashSeedUsesJavaScriptNumberFormatting(t *testing.T) {
	cases := []struct {
		value any
		want  uint32
	}{
		{value: number("0.0000001"), want: 1_378_411_983},
		{value: number("0.000001"), want: 1_341_680_232},
		{value: number("100000000000000000000"), want: 4_184_488_476},
		{value: number("1e21"), want: 3_064_443_381},
	}
	for _, testCase := range cases {
		if actual := hashSeed(testCase.value); actual != testCase.want {
			t.Errorf("hashSeed(%v) = %d, want %d", testCase.value, actual, testCase.want)
		}
	}
}

func BenchmarkComparePairedSamples(b *testing.B) {
	baseline := make([]any, 64)
	candidate := make([]any, 64)
	for index := range baseline {
		baseline[index] = float64(100 + index%13)
		candidate[index] = float64(98+index%13) + float64(index%5)/10
	}
	payload := request{
		Baseline:  baseline,
		Candidate: candidate,
		Options: map[string]any{
			"bootstrapIterations": number("10000"),
			"minimumPairs":        number("5"),
			"seed":                "canvas-native-benchmark",
		},
	}

	b.ReportAllocs()
	for range b.N {
		result := comparePairedSamples(payload)
		if result.PairCount != 64 {
			b.Fatal("unexpected pair count")
		}
	}
}
