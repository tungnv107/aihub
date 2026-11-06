package handler

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/handler/dto"
	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

func chRelayAdminEnabled(c *gin.Context) bool {
	c.Header("Cache-Control", "no-store")
	if os.Getenv("CH_RELAY_LICENSE_ONLY") != "true" {
		middleware.AbortWithError(c, http.StatusNotFound, "LICENSE_DISABLED", "Ch-relay licensing is disabled")
		return false
	}
	return true
}

// POST /api/v1/admin/ch-relay/licenses. Existing admin auth/audit middleware applies.
func (h *APIKeyHandler) CreateChRelayLicense(c *gin.Context) {
	if !chRelayAdminEnabled(c) {
		return
	}
	var req struct {
		UserID int64  `json:"user_id" binding:"required,gt=0"`
		Name   string `json:"name" binding:"required,max=100"`
		Days   int    `json:"expires_in_days" binding:"required,min=1,max=3650"`
		CustomKey *string `json:"custom_key" binding:"omitempty,min=32,max=128"`
	}
	if c.ShouldBindJSON(&req) != nil {
		response.BadRequest(c, "user_id, name and expires_in_days (1-3650) are required")
		return
	}
	if req.CustomKey != nil {
		existing, lookupErr := h.apiKeyService.GetByKeyForChRelay(c.Request.Context(), *req.CustomKey)
		if lookupErr == nil && existing != nil {
			if existing.UserID != req.UserID || existing.Name != chRelayPrefix + req.Name {
				response.BadRequest(c, "Custom key already assigned")
				return
			}
			response.Success(c, dto.APIKeyFromService(existing))
			return
		}
	}
	key, err := h.apiKeyService.Create(c.Request.Context(), req.UserID, service.CreateAPIKeyRequest{
		Name: chRelayPrefix + req.Name, ExpiresInDays: &req.Days, CustomKey: req.CustomKey,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, dto.APIKeyFromService(key))
}

// PUT /api/v1/admin/ch-relay/licenses/:id. Expiry is absolute RFC3339; renewal
// never depends on the client's clock. A revoked key must be explicitly enabled.
func (h *APIKeyHandler) UpdateChRelayLicense(c *gin.Context) {
	if !chRelayAdminEnabled(c) {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		response.BadRequest(c, "Invalid key ID")
		return
	}
	var req struct {
		ExpiresAt *string `json:"expires_at"`
		Status    *string `json:"status" binding:"omitempty,oneof=active inactive"`
	}
	if c.ShouldBindJSON(&req) != nil || req.ExpiresAt == nil && req.Status == nil {
		response.BadRequest(c, "expires_at or status is required")
		return
	}
	key, err := h.apiKeyService.GetByID(c.Request.Context(), id)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	if !strings.HasPrefix(key.Name, chRelayPrefix) {
		response.BadRequest(c, "Not a Ch-relay key")
		return
	}
	update := service.UpdateAPIKeyRequest{Status: req.Status}
	if req.ExpiresAt != nil {
		expiry, parseErr := time.Parse(time.RFC3339, *req.ExpiresAt)
		if parseErr != nil {
			response.BadRequest(c, "expires_at must be RFC3339")
			return
		}
		update.ExpiresAt = &expiry
	}
	key, err = h.apiKeyService.Update(c.Request.Context(), id, key.UserID, update)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, dto.APIKeyFromService(key))
}
