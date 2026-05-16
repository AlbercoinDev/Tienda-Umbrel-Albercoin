package api

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"github.com/albit/umbreltunnel-app/internal/config"
	"github.com/albit/umbreltunnel-app/internal/vps"
	"github.com/albit/umbreltunnel-app/internal/wireguard"
)

type Server struct {
	cfg        *config.Config
	wgMgr      *wireguard.Manager
	vpsClient  *vps.Client
	webFS      embed.FS
	prefix     string
	tunnels    []TunnelEntry
	statePath  string
	vpsURL     string
	vpsAPIKey  string
}

type TunnelEntry struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	LocalPort int    `json:"localPort"`
	LocalHost string `json:"localHost"`
	PublicURL string `json:"publicUrl"`
	CreatedAt string `json:"createdAt"`
}

type appState struct {
	Tunnels []TunnelEntry `json:"tunnels"`
	VpsURL  string        `json:"vpsUrl"`
	VpsKey  string        `json:"vpsApiKey"`
}

func NewServer(cfg *config.Config, wgMgr *wireguard.Manager) *Server {
	s := &Server{
		cfg:       cfg,
		wgMgr:     wgMgr,
		statePath: filepath.Join(cfg.DataDir, "app-state.json"),
	}
	s.loadState()
	return s
}

func (s *Server) SetVPSClient(c *vps.Client) {
	s.vpsClient = c
}

func (s *Server) SetWebFS(fs embed.FS, prefix string) {
	s.webFS = fs
	s.prefix = prefix
}

func (s *Server) saveState() {
	st := appState{
		Tunnels: s.tunnels,
		VpsURL:  s.vpsURL,
		VpsKey:  s.vpsAPIKey,
	}
	data, _ := json.MarshalIndent(st, "", "  ")
	os.WriteFile(s.statePath, data, 0600)
}

func (s *Server) loadState() {
	data, err := os.ReadFile(s.statePath)
	if err != nil {
		return
	}
	var st appState
	if err := json.Unmarshal(data, &st); err != nil {
		return
	}
	if st.Tunnels != nil {
		s.tunnels = st.Tunnels
	}
	s.vpsURL = st.VpsURL
	s.vpsAPIKey = st.VpsKey
	if s.vpsURL != "" {
		s.vpsClient = vps.NewClient(s.vpsURL, s.vpsAPIKey)
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/status", s.basicAuth(s.handleStatus))
	mux.HandleFunc("/api/setup", s.basicAuth(s.handleSetup))
	mux.HandleFunc("/api/wg/key", s.basicAuth(s.handleWGKey))
	mux.HandleFunc("/api/wg/config", s.basicAuth(s.handleWGConfig))
	mux.HandleFunc("/api/wg/connect", s.basicAuth(s.handleWGConnect))
	mux.HandleFunc("/api/wg/status", s.basicAuth(s.handleWGStatus))
	mux.HandleFunc("/api/vps/register", s.basicAuth(s.handleVPSRegister))
	mux.HandleFunc("/api/vps/check", s.basicAuth(s.handleVPSCheck))
	mux.HandleFunc("/api/tunnels", s.basicAuth(s.handleTunnels))
	mux.HandleFunc("/api/tunnels/", s.basicAuth(s.handleTunnelByID))

	if s.webFS != (embed.FS{}) {
		webRoot, _ := fs.Sub(s.webFS, s.prefix)
		fileServer := http.FileServer(http.FS(webRoot))
		mux.Handle("/", s.basicAuth(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/" || r.URL.Path == "" {
				r.URL.Path = "/index.html"
			}
			fileServer.ServeHTTP(w, r)
		}))
	}

	return mux
}

func (s *Server) basicAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.UIAuthUser == "" {
			next(w, r)
			return
		}
		user, pass, ok := r.BasicAuth()
		if !ok || user != s.cfg.UIAuthUser || pass != s.cfg.UIAuthPass {
			w.Header().Set("WWW-Authenticate", `Basic realm="umbreltunnel"`)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func (s *Server) json(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (s *Server) error(w http.ResponseWriter, status int, msg string) {
	s.json(w, status, map[string]string{"error": msg})
}
