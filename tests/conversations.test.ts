import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { asUser, tenantDatabase } from "./helpers/database";
import { groupConversations } from "../lib/chat/history";
import { consumeChatStream, type StreamEvent } from "../lib/chat/stream";

test("personal conversations persist, resume, rename and delete with same-company and cross-company RLS isolation", async () => {
  const db = await tenantDatabase();
  try {
    const owner = randomUUID(),
      colleague = randomUUID(),
      outsider = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'owner@fixture.invalid'),($2,'member@fixture.invalid'),($3,'outside@fixture.invalid')",
      [owner, colleague, outsider],
    );
    await asUser(db, owner);
    const org = (
      await db.query<{ id: string }>(
        "select create_workspace('Personal history test','Other') as id",
      )
    ).rows[0].id;
    const request = randomUUID();
    const id = (
      await db.query<{ data: { conversationId: string } }>(
        "select begin_chat_request($1,null,'What is our process?') as data",
        [request],
      )
    ).rows[0].data.conversationId;
    await db.query(
      "select finish_chat_request($1,'Use the documented process.',$2)",
      [
        request,
        JSON.stringify([
          { id: randomUUID(), title: "Process", excerpt: "Recorded evidence." },
        ]),
      ],
    );
    assert.equal(
      (await db.query("select * from messages where conversation_id=$1", [id]))
        .rows.length,
      2,
    );
    const protectedRequest = randomUUID();
    await db.query(
      "select begin_chat_request($1,$2,'Another owner question')",
      [protectedRequest, id],
    );
    await db.exec("reset role");
    await db.query(
      "insert into organization_members(organization_id,user_id,role) values($1,$2,'member')",
      [org, colleague],
    );
    await asUser(db, colleague);
    for (const table of ["conversations", "messages", "chat_requests"])
      assert.equal(
        (await db.query("select * from " + table)).rows.length,
        0,
        "Same-company member cannot read another user's " + table,
      );
    await assert.rejects(
      db.query("select begin_chat_request($1,$2,'Continue someone else')", [
        randomUUID(),
        id,
      ]),
      /not found/,
    );
    await assert.rejects(
      db.query("select manage_conversation($1,'Stolen title',false)", [id]),
      /not found/,
    );
    await assert.rejects(
      db.query("select manage_conversation($1,null,true)", [id]),
      /not found/,
    );
    const ownRequest = randomUUID();
    const ownId = (
      await db.query<{ data: { conversationId: string } }>(
        "select begin_chat_request($1,null,'Member question') as data",
        [ownRequest],
      )
    ).rows[0].data.conversationId;
    await assert.rejects(
      db.query(
        "insert into messages(organization_id,conversation_id,request_id,role,content) values($1,$2,$3,'assistant','Linked private request')",
        [org, ownId, protectedRequest],
      ),
      /foreign key/,
    );
    await asUser(db, outsider);
    await db.query("select create_workspace('Another company','Other')");
    assert.equal(
      (await db.query("select * from conversations")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select manage_conversation($1,null,true)", [id]),
      /not found/,
    );
    await asUser(db, owner);
    await db.query(
      "select finish_chat_request($1,'Another owner answer.','[]')",
      [protectedRequest],
    );
    const resumed = (
      await db.query<{ content: string }>(
        "select content from messages where conversation_id=$1 order by created_at",
        [id],
      )
    ).rows;
    assert.equal(resumed[1].content, "Use the documented process.");
    const renamed = (
      await db.query<{ data: { title: string } }>(
        "select manage_conversation($1,'  Our process  ',false) as data",
        [id],
      )
    ).rows[0].data;
    assert.equal(renamed.title, "Our process");
    await assert.rejects(
      db.query("select manage_conversation($1,' ',false)", [id]),
      /Invalid/,
    );
    await assert.rejects(
      db.query("select manage_conversation($1,$2,false)", [
        id,
        "a".repeat(121),
      ]),
      /Invalid/,
    );
    await assert.rejects(
      db.query("update conversations set created_by=$1 where id=$2", [
        colleague,
        id,
      ]),
      /row-level security/,
    );
    const next = randomUUID();
    await db.query(
      "select begin_chat_request($1,$2,'And what happens next?')",
      [next, id],
    );
    await assert.rejects(
      db.query("select manage_conversation($1,null,true)", [id]),
      /in progress/,
    );
    await db.query(
      "select finish_chat_request($1,'The next step is documented.','[]')",
      [next],
    );
    assert.equal(
      (await db.query("select * from messages where conversation_id=$1", [id]))
        .rows.length,
      6,
    );
    const replay = (
      await db.query<{ data: { message: { content: string } } }>(
        "select begin_chat_request($1,$2,'And what happens next?') as data",
        [next, id],
      )
    ).rows[0].data;
    assert.equal(replay.message.content, "The next step is documented.");
    await db.query("select manage_conversation($1,null,true)", [id]);
    for (const table of ["conversations", "messages", "chat_requests"])
      assert.equal(
        (await db.query("select * from " + table)).rows.length,
        0,
        "Deletion cascades through " + table,
      );
    await asUser(db, colleague);
    assert.equal(
      (await db.query("select * from conversations")).rows.length,
      1,
      "Deletion preserves the colleague's chat",
    );
    await asUser(db, owner, "email");
    assert.equal(
      (await db.query("select * from conversations")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select manage_conversation($1,'No access',false)", [ownId]),
      /Authentication/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select manage_conversation($1,null,true)", [ownId]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("deleting personal chats does not reset the shared workspace request limit", async () => {
  const db = await tenantDatabase();
  try {
    const owner = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'budget@fixture.invalid')",
      [owner],
    );
    await asUser(db, owner);
    await db.query("select create_workspace('Chat budget test','Other')");
    for (let index = 0; index < 30; index++) {
      const request = randomUUID();
      const id = (
        await db.query<{ data: { conversationId: string } }>(
          "select begin_chat_request($1,null,'Budgeted message') as data",
          [request],
        )
      ).rows[0].data.conversationId;
      await db.query("select finish_chat_request($1,'Recorded answer.','[]')", [
        request,
      ]);
      await db.query("select manage_conversation($1,null,true)", [id]);
      assert.equal(
        (
          await db.query<{ count: number }>(
            "select private.workspace_chat_request_count()::int as count",
          )
        ).rows[0].count,
        index + 1,
      );
    }
    await assert.rejects(
      db.query("select begin_chat_request($1,null,'Another message')", [
        randomUUID(),
      ]),
      /limit reached/,
    );
    await assert.rejects(
      db.query("delete from private.chat_request_rate_events"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec(
      "update private.chat_request_rate_events set created_at=now()-interval '2 minutes'",
    );
    await asUser(db, owner);
    await db.query(
      "select begin_chat_request($1,null,'After the rate window')",
      [randomUUID()],
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select private.workspace_chat_request_count()::int as count",
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});

test("date groups use local calendar boundaries, keep recent chats first and include older history", () => {
  const now = new Date(2026, 9, 11, 14);
  const item = (id: string, days: number) => ({
    id,
    title: id,
    updated_at: new Date(2026, 9, 11 - days, 12).toISOString(),
    created_at: "",
  });
  assert.deepEqual(
    groupConversations(
      [
        item("old", 60),
        item("week", 3),
        item("today", 0),
        item("yesterday", 1),
        item("month", 20),
      ],
      now,
    ).map((group) => group.label),
    ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"],
  );
});

test("SSE handles byte-split Unicode, CRLF boundaries, a trailing frame and transport errors", async () => {
  const text =
    'data: {"type":"draft","text":"Knowledge 🧠"}\r\n\r\ndata: {"type":"done","conversationId":"saved"}';
  const bytes = new TextEncoder().encode(text);
  const events: StreamEvent[] = [];
  await consumeChatStream(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    }),
    (event) => events.push(event),
  );
  assert.equal(events[0].text, "Knowledge 🧠");
  assert.equal(events[1].conversationId, "saved");
  await assert.rejects(
    consumeChatStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: bad-json\n\n"));
          controller.close();
        },
      }),
      () => {},
    ),
    SyntaxError,
  );
});
