package manage

import (
	"errors"
	"os/exec"
	"reflect"
	"strings"
	"testing"

	"netsgo/internal/svcmgr"
)

func TestExecJournalUsesResolvedJournalctlPath(t *testing.T) {
	execErr := errors.New("exec called")
	var gotPath string
	var gotArgv []string

	err := execJournalWith(
		func(file string) (string, error) {
			if file != "journalctl" {
				t.Fatalf("expected journalctl lookup, got %q", file)
			}
			return "/bin/journalctl", nil
		},
		func(argv0 string, argv []string, envv []string) error {
			gotPath = argv0
			gotArgv = append([]string(nil), argv...)
			return execErr
		},
		svcmgr.UnitName(svcmgr.RoleClient),
	)

	if !errors.Is(err, execErr) {
		t.Fatalf("expected exec error, got %v", err)
	}
	if gotPath != "/bin/journalctl" {
		t.Fatalf("expected resolved journalctl path, got %q", gotPath)
	}
	wantArgv := svcmgr.JournalArgs(svcmgr.UnitName(svcmgr.RoleClient), 100)
	if !reflect.DeepEqual(gotArgv, wantArgv) {
		t.Fatalf("expected argv %v, got %v", wantArgv, gotArgv)
	}
}

func TestExecJournalMissingJournalctlFailsClearly(t *testing.T) {
	calledExec := false

	err := execJournalWith(
		func(file string) (string, error) {
			if file != "journalctl" {
				t.Fatalf("expected journalctl lookup, got %q", file)
			}
			return "", exec.ErrNotFound
		},
		func(argv0 string, argv []string, envv []string) error {
			calledExec = true
			return nil
		},
		svcmgr.UnitName(svcmgr.RoleServer),
	)

	if err == nil {
		t.Fatal("expected missing journalctl error")
	}
	if !errors.Is(err, exec.ErrNotFound) {
		t.Fatalf("expected wrapped exec.ErrNotFound, got %v", err)
	}
	if !strings.Contains(err.Error(), "journalctl") || !strings.Contains(err.Error(), "PATH") {
		t.Fatalf("expected actionable journalctl PATH error, got %v", err)
	}
	if calledExec {
		t.Fatal("exec should not run when journalctl is missing")
	}
}
