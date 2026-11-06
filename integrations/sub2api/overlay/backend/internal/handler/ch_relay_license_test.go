package handler

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestChRelayLicenseContract(t *testing.T) {
	t.Setenv("CH_RELAY_LICENSE_ONLY", "true")
	gin.SetMode(gin.TestMode)
	future, past := time.Now().Add(time.Hour), time.Now().Add(-time.Hour)
	for _, tc := range []struct {
		name, status string
		expiry       *time.Time
		expected     int
	}{
		{"ch-relay:paid", "active", &future, 200},
		{"ch-relay:paid", "quota_exhausted", &future, 200},
		{"ch-relay:expired", "active", &past, 403},
		{"ch-relay:expired", "expired", &future, 403},
		{"ch-relay:revoked", "inactive", &future, 403},
		{"ch-relay:no-expiry", "active", nil, 403},
		{"ordinary-user-key", "active", &future, 403},
	} {
		t.Run(tc.name+tc.status, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Set(string(middleware.ContextKeyAPIKey), &service.APIKey{ID: 7, Name: tc.name, Status: tc.status, ExpiresAt: tc.expiry})
			(&GatewayHandler{}).ChRelayLicense(c)
			require.Equal(t, tc.expected, w.Code)
			require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
			if tc.expected == 200 {
				require.Contains(t, w.Body.String(), `"schema":"ch-relay-license-v1"`)
				require.Contains(t, w.Body.String(), `"server_time":`)
				require.NotContains(t, w.Body.String(), `"key":`)
			}
		})
	}
}

func TestChRelayAIHubRequiresGateway(t *testing.T) {
	t.Setenv("CH_RELAY_LICENSE_ONLY", "true")
	t.Setenv("AIHUB_GATEWAY_SECRET", "test-only-gateway-secret-minimum-32-characters")
	future := time.Now().Add(time.Hour)
	for _, supplied := range []string{"", "incorrect", "test-only-gateway-secret-minimum-32-characters"} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("GET", "/v1/ch-relay/license", nil)
		c.Request.Header.Set("X-AIHub-Gateway", supplied)
		c.Set(string(middleware.ContextKeyAPIKey), &service.APIKey{ID: 8, Name: "ch-relay:aihub:test", Status: "active", ExpiresAt: &future})
		(&GatewayHandler{}).ChRelayLicense(c)
		if supplied == "test-only-gateway-secret-minimum-32-characters" { require.Equal(t, 200, w.Code) } else { require.Equal(t, 403, w.Code) }
	}
}
