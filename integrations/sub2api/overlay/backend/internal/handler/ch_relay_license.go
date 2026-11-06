package handler

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

const chRelayPrefix = "ch-relay:"

func (h *GatewayHandler) ChRelayLicense(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if os.Getenv("CH_RELAY_LICENSE_ONLY") != "true" {
		middleware.AbortWithError(c, http.StatusNotFound, "LICENSE_DISABLED", "Ch-relay licensing is disabled")
		return
	}
	key, ok := middleware.GetAPIKeyFromContext(c)
	if !ok || key == nil {
		middleware.AbortWithError(c, http.StatusUnauthorized, "INVALID_API_KEY", "Invalid API key")
		return
	}
	if !strings.HasPrefix(key.Name, chRelayPrefix) {
		middleware.AbortWithError(c, http.StatusForbidden, "LICENSE_DISABLED", "This key is not a Ch-relay license")
		return
	}
	if strings.HasPrefix(key.Name, chRelayPrefix+"aihub:") {
		secret := os.Getenv("AIHUB_GATEWAY_SECRET")
		if len(secret) < 32 || subtle.ConstantTimeCompare([]byte(secret), []byte(c.GetHeader("X-AIHub-Gateway"))) != 1 {
			middleware.AbortWithError(c, http.StatusForbidden, "AIHUB_GATEWAY_REQUIRED", "Use the AIHub license gateway")
			return
		}
	}
	now := time.Now().UTC()
	if key.Status == service.StatusAPIKeyExpired || key.ExpiresAt != nil && !key.ExpiresAt.After(now) {
		middleware.AbortWithError(c, http.StatusForbidden, "API_KEY_EXPIRED", "API key has expired")
		return
	}
	if key.Status != service.StatusAPIKeyActive && key.Status != service.StatusAPIKeyQuotaExhausted {
		middleware.AbortWithError(c, http.StatusForbidden, "API_KEY_DISABLED", "API key is disabled")
		return
	}
	if key.ExpiresAt == nil {
		middleware.AbortWithError(c, http.StatusForbidden, "LICENSE_EXPIRY_REQUIRED", "A finite expiration date is required")
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"schema": "ch-relay-license-v1", "active": true, "feature": "ch-relay",
		"key_id": key.ID, "server_time": now, "expires_at": key.ExpiresAt.UTC(),
	})
}
