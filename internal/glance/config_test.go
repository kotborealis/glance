package glance

import (
	"strings"
	"testing"
	"time"
)

func TestPageRefreshInterval(t *testing.T) {
	for _, test := range []struct {
		name     string
		interval string
		want     time.Duration
	}{
		{name: "configured", interval: "5m", want: 5 * time.Minute},
		{name: "zero disables refresh", interval: "0s", want: 0},
		{name: "maximum interval", interval: "24d", want: 24 * 24 * time.Hour},
	} {
		t.Run(test.name, func(t *testing.T) {
			contents := []byte("pages:\n  - name: Home\n    refresh-interval: " + test.interval + "\n    columns:\n      - size: full\n")
			config, err := newConfigFromYAML(contents)
			if err != nil {
				t.Fatalf("parsing config: %v", err)
			}
			if got := time.Duration(config.Pages[0].RefreshInterval); got != test.want {
				t.Fatalf("refresh interval = %s, want %s", got, test.want)
			}
		})
	}

	contents := []byte("pages:\n  - name: Home\n    refresh-interval: 25d\n    columns:\n      - size: full\n")
	if _, err := newConfigFromYAML(contents); err == nil || !strings.Contains(err.Error(), "must not exceed 24d") {
		t.Fatalf("expected maximum interval validation error, got %v", err)
	}

	contents = []byte("pages:\n  - name: Home\n    refresh-interval: 9223372036854775807d\n    columns:\n      - size: full\n")
	if _, err := newConfigFromYAML(contents); err == nil {
		t.Fatal("expected overflowing duration to be rejected")
	}

	config := &config{}
	config.Pages = []page{{Title: "Home", RefreshInterval: durationField(-time.Second), Columns: []struct {
		Size    string  `yaml:"size"`
		Widgets widgets `yaml:"widgets"`
	}{{Size: "full"}}}}
	if err := isConfigStateValid(config); err == nil || !strings.Contains(err.Error(), "refresh-interval") {
		t.Fatalf("expected negative interval validation error, got %v", err)
	}
}
