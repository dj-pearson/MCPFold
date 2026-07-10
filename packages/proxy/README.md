# @mcpfold/proxy

The local MCP proxy behind **[mcpfold](https://www.npmjs.com/package/mcpfold)** — sits between your
clients and their MCP servers and curates the exposed toolset per client, cutting the tool-schema
tokens an agent never uses (~80% in the [benchmark](https://github.com/dj-pearson/MCPFold/blob/main/docs/benchmark.md)).

This is an internal building block. To use mcpfold, install the CLI:

```sh
npm install -g mcpfold
```

Project & docs: **https://github.com/dj-pearson/MCPFold** · License: MIT
