package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestChRelayCustomerCannotCreateOrExtendKeys(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, enabled := range []string{"true", "false"} {
		t.Setenv("CH_RELAY_LICENSE_ONLY", enabled)
		r := gin.New()
		r.POST("/keys", ChRelayManagedKeysOnly(), func(c *gin.Context) { c.Status(201) })
		r.PUT("/keys/1", ChRelayManagedKeysOnly(), func(c *gin.Context) { c.Status(200) })
		for _, method := range []string{http.MethodPost, http.MethodPut} {
			target := "/keys"
			if method == http.MethodPut {
				target += "/1"
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(method, target, nil))
			if enabled == "true" {
				require.Equal(t, 403, w.Code)
			} else {
				require.Less(t, w.Code, 300)
			}
		}
	}
}
