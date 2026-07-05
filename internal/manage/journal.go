package manage

import (
	"fmt"
	"os"
	"os/exec"

	"netsgo/internal/svcmgr"
)

func execJournal(unit string) error {
	return execJournalWith(exec.LookPath, execAsRoot, unit)
}

func execJournalWith(lookPath func(string) (string, error), execProcess func(string, []string, []string) error, unit string) error {
	if lookPath == nil {
		lookPath = exec.LookPath
	}
	if execProcess == nil {
		execProcess = execAsRoot
	}

	journalPath, err := lookPath("journalctl")
	if err != nil {
		return fmt.Errorf("journalctl is required to view service logs, but it was not found in PATH: %w", err)
	}
	return execProcess(journalPath, svcmgr.JournalArgs(unit, 100), os.Environ())
}
