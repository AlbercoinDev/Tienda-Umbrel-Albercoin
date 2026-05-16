package wireguard

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

type Manager struct {
	dataDir    string
	iface      string
	mu         sync.Mutex
	privateKey string
	publicKey  string
	configPath string
}

func NewManager(dataDir, iface string) *Manager {
	return &Manager{
		dataDir:    dataDir,
		iface:      iface,
		configPath: filepath.Join(dataDir, "wg.conf"),
	}
}

func (m *Manager) GetPublicKey() string {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.publicKey != "" {
		return m.publicKey
	}

	configData, err := os.ReadFile(m.configPath)
	if err == nil {
		for _, line := range strings.Split(string(configData), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "PrivateKey") {
				parts := strings.SplitN(line, "=", 2)
				if len(parts) == 2 {
					priv := strings.TrimSpace(parts[1])
					m.privateKey = priv
					pub, err := pipeToWg("pubkey", priv)
					if err == nil {
						m.publicKey = strings.TrimSpace(pub)
						return m.publicKey
					}
				}
			}
		}
	}

	priv, err := wgCommand("genkey")
	if err != nil {
		return ""
	}
	priv = strings.TrimSpace(priv)
	pub, err := pipeToWg("pubkey", priv)
	if err != nil {
		return ""
	}
	pub = strings.TrimSpace(pub)

	m.privateKey = priv
	m.publicKey = pub
	return pub
}

func (m *Manager) GetPrivateKey() string {
	m.GetPublicKey()
	return m.privateKey
}

func (m *Manager) ApplyConfig(configContent string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if err := os.WriteFile(m.configPath, []byte(configContent), 0600); err != nil {
		return fmt.Errorf("writing config: %w", err)
	}

	exec.Command("wg-quick", "down", m.configPath).Run()

	cmd := exec.Command("wg-quick", "up", m.configPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("wg-quick up: %s: %w", string(out), err)
	}

	return nil
}

func (m *Manager) Disconnect() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	exec.Command("wg-quick", "down", m.configPath).Run()
	return nil
}

func (m *Manager) IsUp() bool {
	cmd := exec.Command("wg", "show", m.iface)
	return cmd.Run() == nil
}

func (m *Manager) Status() string {
	if !m.IsUp() {
		return "disconnected"
	}
	out, _ := exec.Command("wg", "show", m.iface).Output()
	return string(out)
}

func (m *Manager) GetConfigContent() string {
	data, err := os.ReadFile(m.configPath)
	if err != nil {
		return ""
	}
	return string(data)
}

func (m *Manager) GetConfigPath() string {
	return m.configPath
}

func wgCommand(subcmd string) (string, error) {
	out, err := exec.Command("wg", subcmd).Output()
	if err != nil {
		return "", fmt.Errorf("wg %s: %w", subcmd, err)
	}
	return string(out), nil
}

func pipeToWg(subcmd, input string) (string, error) {
	cmd := exec.Command("wg", subcmd)
	cmd.Stdin = strings.NewReader(input)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("wg %s: %w", subcmd, err)
	}
	return string(out), nil
}
