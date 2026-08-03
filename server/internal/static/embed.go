package static

import (
	"embed"
	"io/fs"
)

//go:embed all:assets
var embedded embed.FS

// FS returns the embedded client assets rooted at "assets/".
func FS() fs.FS {
	sub, err := fs.Sub(embedded, "assets")
	if err != nil {
		panic(err)
	}
	return sub
}