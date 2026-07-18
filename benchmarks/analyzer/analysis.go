package main

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
)

const (
	defaultBootstrapIterations = 10_000
	defaultBootstrapSeed       = uint32(0x5eedc0de)
	defaultMinimumPairs        = 5
)

type request struct {
	Baseline  []any          `json:"baseline"`
	Candidate []any          `json:"candidate"`
	Options   map[string]any `json:"options"`
}

type pair struct {
	Index         int      `json:"index"`
	Baseline      float64  `json:"baseline"`
	Candidate     float64  `json:"candidate"`
	AbsoluteDelta float64  `json:"absoluteDelta"`
	PercentDelta  *float64 `json:"percentDelta"`
}

type distribution struct {
	Count        int      `json:"count"`
	MissingCount int      `json:"missingCount"`
	Min          *float64 `json:"min"`
	P25          *float64 `json:"p25"`
	Median       *float64 `json:"median"`
	P75          *float64 `json:"p75"`
	Max          *float64 `json:"max"`
	IQR          *float64 `json:"iqr"`
	MAD          *float64 `json:"mad"`
	Mean         *float64 `json:"mean"`
	Stddev       *float64 `json:"stddev"`
}

type confidenceInterval struct {
	ConfidenceLevel float64  `json:"confidenceLevel"`
	Statistic       string   `json:"statistic"`
	Iterations      int      `json:"iterations"`
	Seed            uint32   `json:"seed"`
	Lower           *float64 `json:"lower"`
	Upper           *float64 `json:"upper"`
}

type bootstrapIntervals struct {
	AbsoluteDelta confidenceInterval `json:"absoluteDelta"`
	PercentDelta  confidenceInterval `json:"percentDelta"`
}

type signConsistency struct {
	ImprovementCount    int      `json:"improvementCount"`
	RegressionCount     int      `json:"regressionCount"`
	UnchangedCount      int      `json:"unchangedCount"`
	DecreaseCount       int      `json:"decreaseCount"`
	IncreaseCount       int      `json:"increaseCount"`
	ImprovementFraction *float64 `json:"improvementFraction"`
	RegressionFraction  *float64 `json:"regressionFraction"`
	UnchangedFraction   *float64 `json:"unchangedFraction"`
	DecreaseFraction    *float64 `json:"decreaseFraction"`
	IncreaseFraction    *float64 `json:"increaseFraction"`
	DominantDirection   string   `json:"dominantDirection"`
	DominantFraction    *float64 `json:"dominantFraction"`
}

type comparison struct {
	InputPairCount                int                `json:"inputPairCount"`
	PairCount                     int                `json:"pairCount"`
	MissingPairCount              int                `json:"missingPairCount"`
	LowerIsBetter                 *bool              `json:"lowerIsBetter"`
	MinimumPairsForClassification int                `json:"minimumPairsForClassification"`
	Baseline                      distribution       `json:"baseline"`
	Candidate                     distribution       `json:"candidate"`
	AbsoluteDelta                 distribution       `json:"absoluteDelta"`
	PercentDelta                  distribution       `json:"percentDelta"`
	PercentDeltaUnavailableCount  int                `json:"percentDeltaUnavailableCount"`
	Bootstrap95                   bootstrapIntervals `json:"bootstrap95"`
	SignConsistency               signConsistency    `json:"signConsistency"`
	Classification                string             `json:"classification"`
	Pairs                         []pair             `json:"pairs"`
}

func pointer[T any](value T) *T {
	return &value
}

func finiteNumber(value any) (float64, bool) {
	var number float64
	switch typed := value.(type) {
	case json.Number:
		parsed, err := typed.Float64()
		if err != nil {
			return 0, false
		}
		number = parsed
	case float64:
		number = typed
	case float32:
		number = float64(typed)
	case int:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case uint64:
		number = float64(typed)
	default:
		return 0, false
	}
	return number, !math.IsNaN(number) && !math.IsInf(number, 0)
}

func validateRequest(input request) error {
	if value, exists := input.Options["lowerIsBetter"]; exists && value != nil {
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("options.lowerIsBetter must be a boolean or null")
		}
	}
	if value, exists := input.Options["seed"]; exists && value != nil {
		switch typed := value.(type) {
		case string:
			if strings.ContainsRune(typed, utf8ReplacementCharacter) {
				return fmt.Errorf("options.seed must contain valid Unicode scalar values")
			}
		case json.Number:
			if _, ok := finiteNumber(typed); !ok {
				return fmt.Errorf("options.seed must be a finite number or string")
			}
		default:
			return fmt.Errorf("options.seed must be a finite number or string")
		}
	}
	for _, name := range []string{"bootstrapIterations", "minimumPairs"} {
		if value, exists := input.Options[name]; exists && value != nil {
			if _, ok := safeInteger(value); !ok {
				return fmt.Errorf("options.%s must be a safe integer", name)
			}
		}
	}
	if value, exists := input.Options["zeroTolerance"]; exists && value != nil {
		if _, ok := finiteNumber(value); !ok {
			return fmt.Errorf("options.zeroTolerance must be a finite number")
		}
	}
	return nil
}

const utf8ReplacementCharacter = '\uFFFD'

func safeInteger(value any) (int64, bool) {
	number, ok := finiteNumber(value)
	if !ok || math.Trunc(number) != number || math.Abs(number) > 9_007_199_254_740_991 {
		return 0, false
	}
	return int64(number), true
}

func quantile(sortedValues []float64, probability float64) *float64 {
	if len(sortedValues) == 0 {
		return nil
	}
	if len(sortedValues) == 1 {
		return pointer(sortedValues[0])
	}
	probability = math.Min(1, math.Max(0, probability))
	position := float64(len(sortedValues)-1) * probability
	lowerIndex := int(math.Floor(position))
	upperIndex := int(math.Ceil(position))
	lower := sortedValues[lowerIndex]
	upper := sortedValues[upperIndex]
	return pointer(lower + (upper-lower)*(position-float64(lowerIndex)))
}

func summarizeDistribution(values []float64, suppliedCount int) distribution {
	if len(values) == 0 {
		return distribution{Count: 0, MissingCount: suppliedCount}
	}

	sortedValues := append([]float64(nil), values...)
	sort.Float64s(sortedValues)
	p25 := quantile(sortedValues, 0.25)
	median := quantile(sortedValues, 0.5)
	p75 := quantile(sortedValues, 0.75)
	mean := 0.0
	for _, value := range values {
		mean += value
	}
	mean /= float64(len(values))
	squaredError := 0.0
	deviations := make([]float64, len(values))
	for index, value := range values {
		difference := value - mean
		squaredError += difference * difference
		deviations[index] = math.Abs(value - *median)
	}
	sort.Float64s(deviations)
	stddev := 0.0
	if len(values) > 1 {
		stddev = math.Sqrt(squaredError / float64(len(values)-1))
	}
	iqr := *p75 - *p25

	return distribution{
		Count:        len(values),
		MissingCount: suppliedCount - len(values),
		Min:          pointer(sortedValues[0]),
		P25:          p25,
		Median:       median,
		P75:          p75,
		Max:          pointer(sortedValues[len(sortedValues)-1]),
		IQR:          pointer(iqr),
		MAD:          quantile(deviations, 0.5),
		Mean:         pointer(mean),
		Stddev:       pointer(stddev),
	}
}

func jsString(value any) string {
	switch typed := value.(type) {
	case nil:
		return "null"
	case string:
		return typed
	case bool:
		return strconv.FormatBool(typed)
	case json.Number:
		number, err := typed.Float64()
		if err == nil {
			return jsNumberString(number)
		}
		return typed.String()
	case float64:
		return jsNumberString(typed)
	default:
		return fmt.Sprint(typed)
	}
}

// JavaScript renders finite numbers in fixed notation for [1e-6, 1e21) and
// otherwise uses an exponent without a zero-padded magnitude. Go and
// JavaScript both use shortest-round-trip digits, but their notation cutoffs
// and exponent spelling differ.
func jsNumberString(value float64) string {
	if value == 0 {
		return "0"
	}
	absolute := math.Abs(value)
	if absolute >= 1e-6 && absolute < 1e21 {
		return strconv.FormatFloat(value, 'f', -1, 64)
	}
	formatted := strconv.FormatFloat(value, 'e', -1, 64)
	exponentIndex := 0
	for index, character := range formatted {
		if character == 'e' {
			exponentIndex = index
			break
		}
	}
	exponent, err := strconv.Atoi(formatted[exponentIndex+1:])
	if err != nil {
		return formatted
	}
	sign := ""
	if exponent >= 0 {
		sign = "+"
	}
	return formatted[:exponentIndex+1] + sign + strconv.Itoa(exponent)
}

func hashSeed(value any) uint32 {
	if integer, ok := safeInteger(value); ok {
		return uint32(integer)
	}
	hash := uint32(0x811c9dc5)
	for _, codeUnit := range utf16.Encode([]rune(jsString(value))) {
		hash ^= uint32(codeUnit)
		hash *= 0x01000193
	}
	return hash
}

type mulberry struct {
	state uint32
}

func (random *mulberry) next() float64 {
	random.state += 0x6d2b79f5
	value := random.state
	value = (value ^ (value >> 15)) * (value | 1)
	value ^= value + (value^(value>>7))*(value|61)
	return float64(value^(value>>14)) / 4_294_967_296
}

func bootstrapMedianConfidenceInterval(values []float64, iterations int, seed uint32) confidenceInterval {
	if len(values) == 0 {
		return confidenceInterval{
			ConfidenceLevel: 0.95,
			Statistic:       "median",
			Iterations:      0,
			Seed:            seed,
		}
	}
	if iterations < 1 {
		iterations = 1
	}
	random := mulberry{state: seed}
	estimates := make([]float64, iterations)
	sample := make([]float64, len(values))
	for iteration := 0; iteration < iterations; iteration++ {
		for index := range sample {
			sample[index] = values[int(random.next()*float64(len(values)))]
		}
		sort.Float64s(sample)
		estimates[iteration] = *quantile(sample, 0.5)
	}
	sort.Float64s(estimates)
	return confidenceInterval{
		ConfidenceLevel: 0.95,
		Statistic:       "median",
		Iterations:      iterations,
		Seed:            seed,
		Lower:           quantile(estimates, 0.025),
		Upper:           quantile(estimates, 0.975),
	}
}

func classifyInterval(
	interval confidenceInterval,
	lowerIsBetter *bool,
	zeroTolerance float64,
	pairCount int,
	minimumPairs int,
) string {
	if interval.Lower == nil || interval.Upper == nil {
		return "no-data"
	}
	if lowerIsBetter == nil {
		return "not-classified"
	}
	if pairCount < minimumPairs {
		return "insufficient-data"
	}
	if math.Abs(*interval.Lower) <= zeroTolerance && math.Abs(*interval.Upper) <= zeroTolerance {
		return "unchanged"
	}
	if *interval.Lower <= zeroTolerance && *interval.Upper >= -zeroTolerance {
		return "inconclusive"
	}
	isNegative := *interval.Upper < -zeroTolerance
	improvement := isNegative
	if !*lowerIsBetter {
		improvement = !isNegative
	}
	if improvement {
		return "improvement"
	}
	return "regression"
}

func booleanOption(options map[string]any, name string) *bool {
	value, exists := options[name]
	if !exists {
		return pointer(true)
	}
	if value == nil {
		return nil
	}
	switch typed := value.(type) {
	case bool:
		return pointer(typed)
	case json.Number:
		number, ok := finiteNumber(typed)
		return pointer(ok && number != 0)
	case string:
		return pointer(typed != "")
	default:
		return pointer(true)
	}
}

func fraction(count int, total int) *float64 {
	if total == 0 {
		return nil
	}
	return pointer(float64(count) / float64(total))
}

func comparePairedSamples(input request) comparison {
	inputPairCount := max(len(input.Baseline), len(input.Candidate))
	pairs := make([]pair, 0, inputPairCount)
	for index := 0; index < inputPairCount; index++ {
		if index >= len(input.Baseline) || index >= len(input.Candidate) {
			continue
		}
		baseline, baselineOK := finiteNumber(input.Baseline[index])
		candidate, candidateOK := finiteNumber(input.Candidate[index])
		if !baselineOK || !candidateOK {
			continue
		}
		absoluteDelta := candidate - baseline
		var percentDelta *float64
		if baseline == 0 {
			if candidate == 0 {
				percentDelta = pointer(0.0)
			}
		} else {
			percentDelta = pointer((absoluteDelta / math.Abs(baseline)) * 100)
		}
		pairs = append(pairs, pair{
			Index:         index,
			Baseline:      baseline,
			Candidate:     candidate,
			AbsoluteDelta: absoluteDelta,
			PercentDelta:  percentDelta,
		})
	}

	lowerIsBetter := booleanOption(input.Options, "lowerIsBetter")
	zeroTolerance := 0.0
	if supplied, ok := finiteNumber(input.Options["zeroTolerance"]); ok {
		zeroTolerance = math.Max(0, supplied)
	}
	minimumPairs := defaultMinimumPairs
	if supplied, ok := safeInteger(input.Options["minimumPairs"]); ok {
		minimumPairs = max(1, int(supplied))
	}
	bootstrapIterations := defaultBootstrapIterations
	if supplied, ok := safeInteger(input.Options["bootstrapIterations"]); ok {
		bootstrapIterations = int(supplied)
	}
	seedValue, hasSeed := input.Options["seed"]
	if !hasSeed || seedValue == nil {
		seedValue = json.Number(strconv.FormatUint(uint64(defaultBootstrapSeed), 10))
	}
	seed := hashSeed(seedValue)

	improvementCount := 0
	regressionCount := 0
	unchangedCount := 0
	decreaseCount := 0
	increaseCount := 0
	absoluteValues := make([]float64, 0, len(pairs))
	percentValues := make([]float64, 0, len(pairs))
	baselineValues := make([]float64, 0, len(pairs))
	candidateValues := make([]float64, 0, len(pairs))
	for _, current := range pairs {
		baselineValues = append(baselineValues, current.Baseline)
		candidateValues = append(candidateValues, current.Candidate)
		absoluteValues = append(absoluteValues, current.AbsoluteDelta)
		if current.PercentDelta != nil {
			percentValues = append(percentValues, *current.PercentDelta)
		}
		if math.Abs(current.AbsoluteDelta) <= zeroTolerance {
			unchangedCount++
			continue
		}
		negative := current.AbsoluteDelta < 0
		if negative {
			decreaseCount++
		} else {
			increaseCount++
		}
		if lowerIsBetter != nil {
			improved := negative
			if !*lowerIsBetter {
				improved = !negative
			}
			if improved {
				improvementCount++
			} else {
				regressionCount++
			}
		}
	}

	absoluteInterval := bootstrapMedianConfidenceInterval(absoluteValues, bootstrapIterations, seed)
	percentInterval := bootstrapMedianConfidenceInterval(percentValues, bootstrapIterations, seed^0x9e3779b9)
	directionalCounts := []int{improvementCount, regressionCount, unchangedCount}
	directionalLabels := []string{"improvement", "regression", "unchanged"}
	if lowerIsBetter == nil {
		directionalCounts = []int{decreaseCount, increaseCount, unchangedCount}
		directionalLabels = []string{"decrease", "increase", "unchanged"}
	}
	dominantCount := max(directionalCounts[0], directionalCounts[1], directionalCounts[2])
	dominantDirection := "no-data"
	if len(pairs) > 0 {
		dominantIndex := -1
		for index, count := range directionalCounts {
			if count != dominantCount {
				continue
			}
			if dominantIndex != -1 {
				dominantIndex = -2
				break
			}
			dominantIndex = index
		}
		if dominantIndex >= 0 {
			dominantDirection = directionalLabels[dominantIndex]
		} else {
			dominantDirection = "mixed"
		}
	}

	return comparison{
		InputPairCount:                inputPairCount,
		PairCount:                     len(pairs),
		MissingPairCount:              inputPairCount - len(pairs),
		LowerIsBetter:                 lowerIsBetter,
		MinimumPairsForClassification: minimumPairs,
		Baseline:                      summarizeDistribution(baselineValues, len(baselineValues)),
		Candidate:                     summarizeDistribution(candidateValues, len(candidateValues)),
		AbsoluteDelta:                 summarizeDistribution(absoluteValues, len(absoluteValues)),
		PercentDelta:                  summarizeDistribution(percentValues, len(percentValues)),
		PercentDeltaUnavailableCount:  len(pairs) - len(percentValues),
		Bootstrap95: bootstrapIntervals{
			AbsoluteDelta: absoluteInterval,
			PercentDelta:  percentInterval,
		},
		SignConsistency: signConsistency{
			ImprovementCount: improvementCount,
			RegressionCount:  regressionCount,
			UnchangedCount:   unchangedCount,
			DecreaseCount:    decreaseCount,
			IncreaseCount:    increaseCount,
			ImprovementFraction: func() *float64 {
				if lowerIsBetter == nil {
					return nil
				}
				return fraction(improvementCount, len(pairs))
			}(),
			RegressionFraction: func() *float64 {
				if lowerIsBetter == nil {
					return nil
				}
				return fraction(regressionCount, len(pairs))
			}(),
			UnchangedFraction: fraction(unchangedCount, len(pairs)),
			DecreaseFraction:  fraction(decreaseCount, len(pairs)),
			IncreaseFraction:  fraction(increaseCount, len(pairs)),
			DominantDirection: dominantDirection,
			DominantFraction:  fraction(dominantCount, len(pairs)),
		},
		Classification: classifyInterval(absoluteInterval, lowerIsBetter, zeroTolerance, len(pairs), minimumPairs),
		Pairs:          pairs,
	}
}
