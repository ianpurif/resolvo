The compressed tokenizer is the official Voyage 4 tokenizer used for `voyage-4-lite`, `voyage-4`, and `voyage-4-large`, as documented at https://docs.voyageai.com/docs/tokenization.

Source: https://huggingface.co/voyageai/voyage-4-large/blob/bb931c2635a93efe400c24741363d8ff61d7bb32/tokenizer.json

SHA-256 of the uncompressed file: `c0382117ea329cdf097041132f6d735924b697924d6f6fc3945713e96ce87539`.

Bundled locally to avoid fetching a mutable tokenizer or sending knowledge to a token-counting service. `@huggingface/tokenizers` performs tokenization on the server; a 16-token per-input allowance covers input-type overhead. Provider-reported usage reconciles the reservation after each response.
