package middleware

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// A license-only server must never let customers mint or extend their own keys.
// Operator issuance is exposed separately under the existing admin middleware.
func ChRelayManagedKeysOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		if os.Getenv("CH_RELAY_LICENSE_ONLY") == "true" {
			AbortWithError(c, http.StatusForbidden, "CH_RELAY_MANAGED_KEYS_ONLY", "Only the operator can create or change license keys")
			return
		}
		c.Next()
	}
}
