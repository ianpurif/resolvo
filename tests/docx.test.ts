import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { extractText } from "../lib/rag/ingest";
import { AppError } from "../lib/config";

// A small real ZIP/DOCX fixture, generated locally without any document service.
function zip(entries: Record<string, string>) {
  const locals: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const raw = Buffer.from(value),
      compressed = deflateRawSync(raw),
      filename = Buffer.from(name);
    let crc = 0xffffffff;
    for (const byte of raw) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(8, 10);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(raw.length, 24);
    record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new File(
    [Uint8Array.from(Buffer.concat([...locals, directory, end]))],
    "knowledge.docx",
  );
}
const contents = {
  "[Content_Types].xml":
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  "_rels/.rels":
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  "word/document.xml":
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Project changes require the department manager review.</w:t></w:r></w:p></w:body></w:document>',
};
test("real DOCX files extract readable text and malformed or expanding archives are rejected", async () => {
  assert.match(
    await extractText(zip(contents), "docx"),
    /department manager review/,
  );
  await assert.rejects(
    extractText(new File(["not a ZIP"], "fake.docx"), "docx"),
    /not a valid/,
  );
  await assert.rejects(
    extractText(zip({ "other.txt": "Missing document part" }), "docx"),
    /not a DOCX/,
  );
  await assert.rejects(
    extractText(
      zip({ ...contents, "word/large.xml": "x".repeat(21 * 1024 * 1024) }),
      "docx",
    ),
    /expands beyond/,
  );
});

test("damaged XML inside a valid DOCX archive returns a controlled validation error", async () => {
  await assert.rejects(
    extractText(
      zip({ ...contents, "word/document.xml": "<w:document><broken" }),
      "docx",
    ),
    (error) => error instanceof AppError && error.status === 400,
  );
});
