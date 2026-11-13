# Visual Multi-Agent Office

## Product Requirements, System Architecture & Implementation Specification

**Version:** 1.0\
**Ngày lập:** 13/11/2026\
**Trạng thái:** Product specification / MVP planning\
**Định hướng:** Local-first · Claude Code first · Zero additional API
token · Pixel-art visualization

------------------------------------------------------------------------

## 1. Tổng quan sản phẩm

### 1.1. Ý tưởng

**Visual Multi-Agent Office** là một ứng dụng dashboard chạy local, có
khả năng quan sát hoạt động thực tế của các Agent đang chạy thông qua
Claude Code và trực quan hóa chúng trong một văn phòng ảo phong cách
Pixel Art.

Mỗi Agent thực tế được biểu diễn bằng một nhân vật trong văn phòng. Khi
Agent bắt đầu làm việc, gọi tool, chờ, hoàn thành hoặc gặp lỗi, giao
diện sẽ cập nhật trạng thái tương ứng dựa trên các sự kiện thực tế thu
thập được từ Claude Code.

Sản phẩm kết hợp hai lớp giao diện:

1.  **Visual Office:** Không gian văn phòng Pixel Art giúp người dùng
    quan sát nhanh đội ngũ Agent.
2.  **Technical Monitoring:** Dashboard kỹ thuật cung cấp trạng thái,
    session, task, tool execution, event timeline và lịch sử hoạt động.

Mục tiêu không phải tạo thêm một AI Agent runtime. Claude Code vẫn là
môi trường thực thi và nguồn sự thật về quá trình chạy Agent. Visual
Multi-Agent Office chỉ thu thập, chuẩn hóa, lưu trữ và trình bày những
gì runtime cung cấp.

### 1.2. Mục tiêu sản phẩm

-   Tự động phát hiện và theo dõi các phiên Claude Code được cấu hình
    tích hợp.
-   Hiển thị Main Agent, Subagents và các teammate mà Claude Code cung
    cấp sự kiện nhận diện.
-   Theo dõi trạng thái Agent theo thời gian thực.
-   Quan sát Agent đang thực hiện tool nào, task nào và hoạt động gần
    đây.
-   Xem lịch sử session sau khi phiên Claude Code kết thúc.
-   Chạy hoàn toàn trên máy local trong MVP.
-   Không yêu cầu người dùng cung cấp Anthropic API key hoặc API token
    bổ sung cho dashboard.
-   Không làm thay đổi hành vi thực thi bình thường của Claude Code.

### 1.3. Nguyên tắc cốt lõi

  -----------------------------------------------------------------------
  Nguyên tắc                          Mô tả
  ----------------------------------- -----------------------------------
  Local-first                         Backend, database, collector và UI
                                      có thể chạy trên máy người dùng.

  Zero additional API token           Dashboard không gọi Anthropic API
                                      và không cần API key riêng.

  Runtime is source of truth          Claude Code quyết định Agent thực
                                      sự chạy như thế nào.

  Event-driven                        Trạng thái UI được cập nhật từ các
                                      event quan sát được.

  Read-only MVP                       Dashboard chỉ quan sát, không điều
                                      khiển Agent.

  Evidence-based                      Không suy đoán trạng thái, vai trò,
                                      giao tiếp hoặc kết quả không có dữ
                                      liệu chứng minh.

  Resilient                           Dashboard/backend gặp lỗi không
                                      được làm hỏng hoặc chặn Claude
                                      Code.

  Extensible                          Có thể bổ sung runtime adapter, máy
                                      tính và project trong các giai đoạn
                                      sau.
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 2. Phạm vi và giới hạn token

### 2.1. "Không dùng token" có nghĩa là gì?

Trong MVP, Visual Multi-Agent Office **không sử dụng thêm API token của
người dùng** vì:

-   Không gửi prompt đến Anthropic API.
-   Không gọi Claude để phân tích hoặc tóm tắt event.
-   Không sử dụng LLM để dự đoán Agent đang làm gì.
-   Không yêu cầu người dùng nhập API key vào dashboard.
-   Việc thu thập event được thực hiện thông qua Claude Code Hooks và
    local collector.

Claude Code vẫn cần cơ chế xác thực và hạn mức riêng của chính Claude
Code theo tài khoản hoặc phương thức đăng nhập mà người dùng đang sử
dụng. Sản phẩm không thay thế, né tránh hoặc thay đổi cơ chế tính
phí/xác thực đó.

### 2.2. Phân biệt các thành phần

  -----------------------------------------------------------------------
  Thành phần              Vai trò                 API token bổ sung
  ----------------------- ----------------------- -----------------------
  Claude Code             Thực thi prompt, agent  Không phát sinh token
                          và tool                 riêng cho dashboard;
                                                  Claude Code vẫn theo cơ
                                                  chế tài khoản của người
                                                  dùng

  Claude Code Hooks       Phát event trong các    Không
                          lifecycle/tool hook     
                          được hỗ trợ             

  Local Hook Collector    Nhận và chuyển tiếp     Không
                          event                   

  Backend                 Chuẩn hóa, lưu trữ,     Không
                          tính trạng thái         

  PostgreSQL              Lưu dữ liệu local       Không

  WebSocket               Cập nhật UI             Không

  Pixel Art UI            Hiển thị văn phòng và   Không
                          monitoring              

  Tính năng AI bổ sung    Phân tích/tóm tắt bằng  Có thể cần, nhưng phải
  trong tương lai         LLM nếu được bổ sung    là tính năng opt-in
                                                  riêng
  -----------------------------------------------------------------------

### 2.3. Giới hạn quan sát

Không nên mô tả hệ thống là "tự kết nối và đọc được mọi thứ bên trong
Claude Code". Cơ chế MVP dựa trên các hook/event mà Claude Code hỗ trợ
và những dữ liệu có thể thu thập hợp lệ.

Một số thông tin có thể không được cung cấp đầy đủ bởi hook, ví dụ: -
Nội dung hội thoại nội bộ giữa các Agent. - Ý định hoặc suy nghĩ riêng
của Agent. - Token/cost chính xác nếu event không cung cấp dữ liệu tương
ứng. - Quan hệ task hoặc vai trò không được runtime công bố. - Agent
không phát event hoặc event bị mất trong thời gian collector ngừng hoạt
động.

Khi thiếu dữ liệu, hệ thống phải hiển thị `UNKNOWN`, `NOT_AVAILABLE`
hoặc trạng thái chưa xác định, thay vì tự suy luận.

------------------------------------------------------------------------

## 3. Người dùng mục tiêu và use cases

### 3.1. Người dùng mục tiêu

-   Developer sử dụng Claude Code để phát triển phần mềm.
-   Developer chạy nhiều Subagents hoặc Agent Teams.
-   Technical Lead muốn quan sát tiến độ của nhiều Agent.
-   Người xây dựng AI automation/workflow trên máy cá nhân.

### 3.2. Các use case chính

**UC-01: Quan sát phiên Claude Code** 1. Người dùng mở Claude Code như
bình thường. 2. Claude Code phát lifecycle event. 3. Hook Collector nhận
event. 4. Backend tạo/cập nhật session và Agent. 5. Nhân vật xuất hiện
trong văn phòng ảo.

**UC-02: Quan sát Subagent** 1. Main Agent tạo Subagent. 2. Claude Code
phát sự kiện Subagent tương ứng. 3. Hệ thống tạo Agent con và liên kết
với parent nếu có ID. 4. UI hiển thị nhân vật mới.

**UC-03: Theo dõi tool execution** 1. Agent gọi một tool. 2. Hệ thống
nhận `PreToolUse`. 3. Inspector hiển thị tool đang chạy. 4. Khi có
`PostToolUse` hoặc `PostToolUseFailure`, trạng thái execution được cập
nhật.

**UC-04: Theo dõi task** 1. Runtime phát event task được hỗ trợ. 2. Hệ
thống tạo/cập nhật task. 3. UI hiển thị task, trạng thái và Agent được
gán nếu dữ liệu có sẵn.

**UC-05: Xem lịch sử** 1. Người dùng mở một session đã kết thúc. 2.
Backend tải snapshot, timeline và event history. 3. UI cho phép xem lại
hoạt động theo thời gian.

**UC-06: Khôi phục kết nối** 1. Frontend mất kết nối WebSocket. 2.
Frontend kết nối lại. 3. Backend trả snapshot và event còn thiếu theo
sequence/cursor. 4. UI đồng bộ lại trạng thái.

------------------------------------------------------------------------

## 4. Phạm vi MVP

### 4.1. Must-have

1.  Tích hợp Claude Code Hooks.
2.  Local Hook Collector.
3.  Nhận diện session.
4.  Nhận diện Main Agent/Subagent khi có dữ liệu.
5.  Theo dõi lifecycle event.
6.  Theo dõi tool start/success/failure.
7.  Theo dõi task event nếu runtime cung cấp.
8.  Agent state machine.
9.  Pixel Art Office.
10. Agent inspector.
11. Activity timeline.
12. Session history.
13. PostgreSQL persistence.
14. WebSocket realtime.
15. Event deduplication.
16. Reconnect và snapshot recovery.
17. Docker Compose local deployment.
18. Tài liệu cài đặt và cấu hình.

### 4.2. Không thuộc MVP

-   Tạo hoặc điều phối Agent mới.
-   Gửi prompt hoặc task đến Claude Code.
-   Dừng, pause hoặc resume Agent từ dashboard.
-   Thay thế Claude Code orchestration.
-   Đọc hoặc lưu toàn bộ prompt/transcript mặc định.
-   Dùng LLM để phân tích hoạt động.
-   Hỗ trợ Codex, Gemini CLI hoặc runtime khác.
-   Multi-machine management.
-   Team collaboration/cloud hosting.
-   Cost analytics nếu không có nguồn dữ liệu đáng tin cậy.
-   Suy đoán giao tiếp Agent từ việc chúng cùng làm một project.

### 4.3. Các giai đoạn mở rộng

**Phase 2** - Multi-project workspace. - Search/filter execution
history. - Task dependency visualization. - Agent communication
visualization khi có dữ liệu quan sát được. - Token/cost analytics khi
nguồn dữ liệu hỗ trợ. - Notifications. - Export session report.

**Phase 3** - Multi-machine collector. - Runtime adapter cho
Codex/Gemini hoặc runtime khác. - Agent control/task dispatch, sau khi
có thiết kế bảo mật riêng. - Team collaboration. - Advanced analytics.

------------------------------------------------------------------------

## 5. Kiến trúc tổng thể

### 5.1. Sơ đồ luồng dữ liệu

``` text
Claude Code (Local)
  ├── Main Agent
  ├── Subagents
  └── Agent Teams (nếu được sử dụng)
          |
          | Claude Code Hooks (JSON qua stdin)
          v
Local Hook Collector
  ├── Read stdin
  ├── Validate payload
  ├── Attach local metadata
  ├── Normalize / forward
  └── Retry spool (nếu bật)
          |
          | HTTP local endpoint
          v
NestJS Backend (Modular Monolith)
  ├── Hook Ingestion
  ├── Event Validation
  ├── Normalization
  ├── Deduplication
  ├── Domain Event Processor
  ├── Agent / Session / Task Projections
  ├── REST API
  └── WebSocket Gateway
          |
          v
PostgreSQL
          |
          | WebSocket + REST snapshots
          v
Next.js Frontend
  ├── Pixel Art Office (PixiJS)
  ├── Dashboard
  ├── Agent Inspector
  ├── Task Board
  ├── Activity Timeline
  └── Session History
```

### 5.2. Kiến trúc đề xuất

MVP nên dùng **Modular Monolith**, không cần microservices.

  -----------------------------------------------------------------------
  Layer                   Công nghệ               Trách nhiệm
  ----------------------- ----------------------- -----------------------
  Frontend                Next.js + React +       UI và routing
                          TypeScript              

  UI components           Tailwind CSS +          Dashboard, panel,
                          shadcn/ui               table, form

  Pixel renderer          PixiJS                  Map, sprite, animation,
                                                  camera

  Backend                 NestJS                  API, event processing,
                                                  domain logic

  Database                PostgreSQL              Persistence

  ORM                     Prisma                  Schema, migration,
                                                  query

  Realtime                Socket.IO/WebSocket     Push update

  Validation              Zod hoặc                Validate event/DTO
                          class-validator         

  Package manager         pnpm                    Monorepo

  Deployment              Docker Compose          Local
                                                  development/runtime

  Tests                   Vitest + Playwright     Unit/integration/E2E
  -----------------------------------------------------------------------

**Không cần Redis trong MVP.** Chỉ bổ sung khi có nhu cầu queue,
multi-process coordination hoặc workload thực tế chứng minh cần thiết.

### 5.3. Ranh giới trách nhiệm

-   Claude Code: thực thi và điều phối Agent.
-   Hook Collector: nhận dữ liệu từ runtime, xử lý tối thiểu và chuyển
    tiếp.
-   Backend: chuẩn hóa, lưu trữ, tạo projection và cung cấp API.
-   Database: lưu event gốc đã được lọc và dữ liệu nghiệp vụ.
-   Frontend: trình bày dữ liệu, không tự tạo ra sự thật về trạng thái
    Agent.

------------------------------------------------------------------------

## 6. Claude Code integration

### 6.1. Cơ chế tích hợp

Sử dụng Claude Code Hooks. Hook command nhận JSON từ standard input và
chuyển event đến local collector.

Collector nên là một chương trình độc lập, nhẹ, có thể viết bằng
TypeScript/Node.js. Không nên thực hiện logic nghiệp vụ phức tạp bên
trong hook script.

### 6.2. Các hook/event cần khảo sát và tích hợp

  -----------------------------------------------------------------------
  Hook/event              Mục đích trong hệ thống Xử lý dự kiến
  ----------------------- ----------------------- -----------------------
  `SessionStart`          Phiên bắt đầu           Tạo/cập nhật session

  `SessionEnd`            Phiên kết thúc          Đóng session

  `SubagentStart`         Subagent bắt đầu        Đăng ký Agent con

  `SubagentStop`          Subagent dừng           Cập nhật trạng thái
                                                  terminal phù hợp

  `PreToolUse`            Tool sắp chạy           Tạo tool execution đang
                                                  chạy

  `PostToolUse`           Tool hoàn tất           Đánh dấu thành công

  `PostToolUseFailure`    Tool thất bại           Đánh dấu lỗi

  `Stop`                  Một turn dừng           Cập nhật trạng thái
                                                  turn; không đồng nghĩa
                                                  SessionEnd

  `Notification`          Có notification         Ghi nhận notification

  `TaskCreated`           Task được tạo nếu       Tạo task
                          runtime hỗ trợ          

  `TaskCompleted`         Task hoàn thành nếu     Cập nhật task
                          runtime hỗ trợ          

  `TeammateIdle`          Teammate chuyển idle    Cập nhật presence/state
                          nếu runtime hỗ trợ      
  -----------------------------------------------------------------------

**Lưu ý:** Danh sách event, payload, trường bắt buộc và điều kiện kích
hoạt phải được đối chiếu với tài liệu Claude Code chính thức tại thời
điểm triển khai. Không được giả định mọi hook/event đều có mặt trong mọi
phiên bản hoặc mọi chế độ sử dụng.

Tài liệu cần kiểm tra: - https://code.claude.com/docs/en/hooks -
https://code.claude.com/docs/en/sub-agents -
https://code.claude.com/docs/en/agent-teams

### 6.3. Hook Collector requirements

-   Đọc JSON từ stdin.
-   Validate payload và phiên bản schema.
-   Không tin cậy dữ liệu đầu vào.
-   Gắn `received_at`, collector version và machine identifier nội bộ.
-   Tạo dedupe key ổn định.
-   Gửi event đến backend local.
-   Có timeout ngắn.
-   Có retry/backoff có giới hạn.
-   Có thể ghi spool file local nếu bật reliable delivery.
-   Không block hoặc làm thay đổi kết quả thực thi Claude Code nếu
    collector/backend lỗi.
-   Không thực thi shell command lấy từ event payload.
-   Không ghi secret, API key hoặc nội dung nhạy cảm vào log.
-   Không lưu prompt/tool output đầy đủ theo mặc định.

### 6.4. Cấu hình hook

Hệ thống cần cung cấp hướng dẫn cài đặt hook vào cấu hình Claude Code.
Có thể cung cấp script setup/uninstall để người dùng dễ bật/tắt tích
hợp.

Yêu cầu: - Backup cấu hình hiện tại trước khi sửa. - Không ghi đè hook
của người dùng. - Hỗ trợ gỡ tích hợp sạch. - Kiểm tra collector health
trước khi bật. - Hiển thị trạng thái integration: Connected / Degraded /
Disconnected. - Không yêu cầu API key.

------------------------------------------------------------------------

## 7. Domain model và trạng thái Agent

### 7.1. Phân biệt Session, Agent và Turn

Không gộp ba khái niệm này:

-   **Session:** phiên Claude Code.
-   **Agent:** thực thể thực thi trong session, ví dụ main agent hoặc
    subagent.
-   **Turn:** một lượt xử lý của Agent.

Một session có thể vẫn đang hoạt động trong khi Agent đang idle giữa các
turn. `Stop` không được hiểu nhầm là `SessionEnd`.

### 7.2. Agent lifecycle states

  -----------------------------------------------------------------------
  State                   Ý nghĩa                 Biểu diễn Pixel Art
  ----------------------- ----------------------- -----------------------
  `DISCOVERED`            Đã nhận diện nhưng chưa Đứng/chờ
                          có đủ dữ liệu hoạt động 

  `WORKING`               Đang thực hiện hoạt     Ngồi gõ máy
                          động được quan sát      

  `WAITING`               Có bằng chứng đang chờ  Đứng chờ

  `IDLE`                  Được xác nhận idle      Ngồi nghỉ

  `COMPLETED`             Đã hoàn thành theo      Ăn mừng
                          event đáng tin cậy      

  `FAILED`                Có event lỗi terminal   Cảnh báo
                          phù hợp                 

  `STOPPED`               Đã dừng nhưng không     Không hoạt động
                          nhất thiết là hoàn      
                          thành                   

  `UNKNOWN`               Không đủ dữ liệu hoặc   Dấu hỏi
                          dữ liệu đã stale        
  -----------------------------------------------------------------------

### 7.3. Quy tắc chuyển trạng thái

-   `PreToolUse` có thể đưa Agent sang `WORKING`.
-   `PostToolUse` kết thúc một tool execution, nhưng không nhất thiết
    chứng minh Agent đã hoàn tất toàn bộ task.
-   `PostToolUseFailure` đánh dấu tool execution lỗi; không mặc định
    toàn bộ Agent/session thất bại.
-   `SubagentStop` cập nhật trạng thái subagent theo semantics thực tế
    của hook.
-   `SessionEnd` kết thúc session.
-   `Stop` chỉ cập nhật turn/Agent theo ngữ nghĩa hook; không đóng
    session.
-   Nếu quá thời gian không nhận event, đánh dấu presence là stale hoặc
    `UNKNOWN`, không tự kết luận Agent đã dừng.
-   State projection phải xét thứ tự event và timestamp; event đến trễ
    không được ghi đè trạng thái mới hơn một cách mù quáng.

### 7.4. Agent identity

Ưu tiên sử dụng ID do runtime cung cấp. Nếu không có ID ổn định: - Tạo
fallback identity có scope theo session. - Lưu `identity_confidence`. -
Lưu nguồn và phương pháp nhận diện. - Không gộp hai Agent chỉ vì chúng
có cùng tên.

### 7.5. Agent metadata

Các trường đề xuất: - `runtime_agent_id` - `name` - `agent_type`: MAIN /
SUBAGENT / TEAMMATE / UNKNOWN - `parent_agent_id` - `role` (chỉ khi có
metadata/config tường minh) - `current_tool` - `status` -
`last_seen_at` - `identity_confidence` - `metadata` JSONB

Không tự suy đoán role từ tên Agent hoặc tên model.

------------------------------------------------------------------------

## 8. Event contract

### 8.1. Nguyên tắc

-   Event gốc từ Claude Code và normalized domain event là hai lớp khác
    nhau.
-   Lưu nguồn event và adapter version.
-   Mỗi event có schema version.
-   Dedupe event trước khi xử lý projection.
-   Dùng UTC cho timestamp lưu trữ.
-   Giữ payload ở mức tối thiểu cần thiết.
-   Redact secret trước khi persist/log.

### 8.2. Normalized event envelope

``` json
{
  "event_id": "evt_01JXYZ",
  "event_type": "agent.tool.started",
  "schema_version": "1.0",
  "source": {
    "runtime": "claude_code",
    "adapter_version": "1.0.0"
  },
  "context": {
    "project_id": "project-uuid",
    "session_id": "session-uuid",
    "runtime_session_id": "claude-session-id",
    "agent_id": "agent-uuid",
    "runtime_agent_id": "runtime-agent-id",
    "parent_agent_id": null,
    "task_id": null
  },
  "occurred_at": "2026-11-13T04:00:00.000Z",
  "received_at": "2026-11-13T04:00:00.100Z",
  "payload": {
    "tool_name": "Read",
    "tool_use_id": "tool-123"
  },
  "metadata": {
    "machine_id": "local-machine",
    "dedupe_key": "claude:session:agent:tool:pre:123"
  }
}
```

### 8.3. Normalized domain events

-   `session.started`
-   `session.ended`
-   `agent.created`
-   `agent.started`
-   `agent.idle`
-   `agent.completed`
-   `agent.failed`
-   `agent.stopped`
-   `agent.status.changed`
-   `agent.tool.started`
-   `agent.tool.completed`
-   `agent.tool.failed`
-   `task.created`
-   `task.started`
-   `task.completed`
-   `task.updated`
-   `communication.observed`
-   `notification.received`

Đây là event nội bộ của sản phẩm, không khẳng định chúng là tên hook
nguyên bản của Claude Code.

### 8.4. Dedupe và ordering

-   Dedupe key phải ổn định khi retry.
-   Có unique constraint cho `(source, source_event_id)` hoặc khóa tương
    đương.
-   Nếu runtime không cấp event ID, collector tạo fingerprint từ các
    trường ổn định có sẵn.
-   Không giả định event luôn đến đúng thứ tự.
-   Lưu `occurred_at` và `received_at` riêng biệt.
-   Projection cần xử lý event trễ, trùng và replay an toàn.

### 8.5. WebSocket contract

Channel đề xuất: - `office:project:{projectId}` -
`office:session:{sessionId}` - `office:agent:{agentId}`

Event phía client: - `office.event` - `agent.created` -
`agent.updated` - `agent.status.changed` - `agent.activity.updated` -
`task.created` - `task.updated` - `task.completed` -
`communication.observed` - `session.updated` - `collector.status`

Mỗi message nên có: - `event_id` - `sequence` - `occurred_at` -
`schema_version` - `payload`

Khi reconnect: 1. Client gửi sequence/cursor cuối đã nhận. 2. Server trả
snapshot hiện tại. 3. Server replay event bị thiếu nếu còn trong
retention/replay window. 4. Client áp dụng event theo sequence. 5. Nếu
không thể replay đầy đủ, client tải snapshot mới.

------------------------------------------------------------------------

## 9. Database schema đề xuất

Dùng PostgreSQL. Các ID nội bộ nên dùng UUID. JSONB chỉ dùng cho
metadata hoặc payload runtime-specific, không thay thế các cột quan hệ
cốt lõi.

### 9.1. `projects`

  Field           Type            Ghi chú
  --------------- --------------- -----------------
  `id`            UUID            Primary key
  `name`          VARCHAR         Tên project
  `root_path`     TEXT            Đường dẫn local
  `description`   TEXT nullable   Mô tả
  `created_at`    TIMESTAMP       
  `updated_at`    TIMESTAMP       

### 9.2. `sessions`

  Field                  Type                 Ghi chú
  ---------------------- -------------------- --------------------------
  `id`                   UUID                 Primary key
  `project_id`           UUID                 FK projects
  `runtime`              VARCHAR              `claude_code`
  `runtime_session_id`   VARCHAR              ID từ runtime nếu có
  `status`               VARCHAR              ACTIVE / ENDED / UNKNOWN
  `started_at`           TIMESTAMP nullable   
  `ended_at`             TIMESTAMP nullable   
  `last_event_at`        TIMESTAMP nullable   
  `created_at`           TIMESTAMP            

Unique index: `(runtime, runtime_session_id)` khi runtime ID tồn tại.

### 9.3. `agents`

  Field                   Type                 Ghi chú
  ----------------------- -------------------- --------------------------------------
  `id`                    UUID                 Primary key
  `session_id`            UUID                 FK sessions
  `parent_agent_id`       UUID nullable        FK agents
  `runtime_agent_id`      VARCHAR nullable     ID runtime
  `name`                  VARCHAR              Tên hiển thị
  `agent_type`            VARCHAR              MAIN / SUBAGENT / TEAMMATE / UNKNOWN
  `role`                  VARCHAR nullable     Chỉ từ metadata tường minh
  `status`                VARCHAR              Lifecycle state
  `current_tool`          VARCHAR nullable     Tool đang chạy
  `identity_confidence`   VARCHAR              HIGH / MEDIUM / LOW
  `last_seen_at`          TIMESTAMP nullable   
  `metadata`              JSONB                Runtime metadata
  `created_at`            TIMESTAMP            
  `updated_at`            TIMESTAMP            

### 9.4. `tasks`

  -----------------------------------------------------------------------
  Field                   Type                    Ghi chú
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `session_id`            UUID                    FK sessions

  `runtime_task_id`       VARCHAR nullable        ID từ runtime

  `assigned_agent_id`     UUID nullable           FK agents

  `subject`               TEXT                    

  `description`           TEXT nullable           

  `status`                VARCHAR                 PENDING / IN_PROGRESS /
                                                  COMPLETED / FAILED /
                                                  UNKNOWN

  `created_at`            TIMESTAMP               

  `started_at`            TIMESTAMP nullable      

  `completed_at`          TIMESTAMP nullable      

  `updated_at`            TIMESTAMP               
  -----------------------------------------------------------------------

Unique index: `(session_id, runtime_task_id)` khi runtime task ID tồn
tại.

### 9.5. `task_dependencies`

-   `task_id`
-   `depends_on_task_id`
-   `created_at`

Composite primary key `(task_id, depends_on_task_id)`. Không cho phép
task phụ thuộc chính nó.

### 9.6. `events`

  Field               Type               Ghi chú
  ------------------- ------------------ ------------------------
  `id`                UUID               Primary key
  `source`            VARCHAR            Runtime/adapter
  `source_event_id`   VARCHAR nullable   ID nguồn
  `dedupe_key`        VARCHAR            Stable dedupe key
  `session_id`        UUID nullable      FK sessions
  `agent_id`          UUID nullable      FK agents
  `task_id`           UUID nullable      FK tasks
  `event_type`        VARCHAR            Normalized event type
  `schema_version`    VARCHAR            
  `payload`           JSONB              Payload đã redact
  `occurred_at`       TIMESTAMP          Runtime time
  `received_at`       TIMESTAMP          Collector/backend time
  `sequence`          BIGINT nullable    Ordering nội bộ

Indexes: - `(session_id, occurred_at)` - `(agent_id, occurred_at)` -
`(event_type, occurred_at)` - unique `(source, source_event_id)` khi
source event ID tồn tại - unique `(source, dedupe_key)`

### 9.7. `activities`

Bảng projection phục vụ timeline: - `id` - `session_id` - `agent_id` -
`activity_type` - `title` - `description` nullable - `started_at` -
`ended_at` nullable - `source_event_id` nullable - `metadata` JSONB

### 9.8. `communications` (tùy chọn / Phase 2)

-   `id`
-   `session_id`
-   `sender_agent_id`
-   `receiver_agent_id` nullable
-   `message_type`
-   `capture_method`
-   `confidence`
-   `metadata` JSONB
-   `occurred_at`

Chỉ tạo communication record khi có bằng chứng quan sát được. Phải phân
biệt `OBSERVED` và `INFERRED`; MVP nên chỉ hiển thị dữ liệu `OBSERVED`.

### 9.9. Bảng có thể bổ sung sau

-   `tool_executions`
-   `event_outbox`
-   `agent_presence`
-   `machine_nodes`
-   `runtime_connections`

Không cần triển khai tất cả ngay từ đầu. Có thể dùng `events` và
`activities` cho MVP, sau đó tách `tool_executions` nếu truy vấn hoặc
reporting yêu cầu.

------------------------------------------------------------------------

## 10. Backend module design

Cấu trúc module NestJS đề xuất:

``` text
apps/api/src/
├── modules/
│   ├── projects/
│   ├── sessions/
│   ├── agents/
│   ├── tasks/
│   ├── events/
│   ├── activities/
│   ├── communications/
│   ├── analytics/
│   └── realtime/
├── adapters/
│   └── claude-code/
│       ├── hooks/
│       ├── normalizers/
│       ├── parsers/
│       └── claude-code.adapter.ts
├── infrastructure/
│   ├── database/
│   ├── websocket/
│   ├── security/
│   └── logging/
├── common/
│   ├── dto/
│   ├── enums/
│   ├── errors/
│   └── utils/
└── main.ts
```

### 10.1. Ingestion flow

1.  Nhận event tại endpoint local.
2.  Kiểm tra request size và content type.
3.  Validate cấu trúc.
4.  Redact trường nhạy cảm.
5.  Tạo/kiểm tra dedupe key.
6.  Persist event.
7.  Xử lý domain projection trong transaction hoặc cơ chế đảm bảo retry
    an toàn.
8.  Phát WebSocket event sau khi persistence thành công.
9.  Trả ACK cho collector.

Không phát realtime event trước khi dữ liệu đã được lưu bền vững, trừ
khi có thiết kế outbox đảm bảo nhất quán.

### 10.2. API endpoints đề xuất

``` text
GET    /api/health
GET    /api/collector/status

GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId

GET    /api/projects/:projectId/sessions
GET    /api/sessions/:sessionId
GET    /api/sessions/:sessionId/events
GET    /api/sessions/:sessionId/agents

GET    /api/agents
GET    /api/agents/:agentId
GET    /api/agents/:agentId/events
GET    /api/agents/:agentId/activities

GET    /api/tasks
GET    /api/tasks/:taskId

GET    /api/office/:projectId/snapshot
GET    /api/dashboard/summary
```

Các endpoint tạo/sửa task hoặc điều khiển Agent không nằm trong MVP.

------------------------------------------------------------------------

## 11. Frontend và trải nghiệm người dùng

### 11.1. Navigation

-   Office
-   Dashboard
-   Agents
-   Tasks
-   Activity
-   Sessions
-   Settings

### 11.2. Office screen

``` text
+-------------------------------------------------------------+
| Project / Session selector          Collector status        |
+------------------+----------------------------+-------------+
| Project sidebar  |                            | Agent       |
|                  |       PIXEL ART OFFICE     | Inspector   |
| Session list     |                            |             |
|                  |  Rooms / Desks / Agents    | Status      |
|                  |                            | Current tool|
|                  |                            | Task        |
+------------------+----------------------------+-------------+
|                    Recent Activity Feed                     |
+-------------------------------------------------------------+
```

Thành phần: - Top bar: project/session selector, connection status. -
Left sidebar: project và session. - Center: Pixel Art Office. - Right
panel: Agent inspector. - Bottom: activity feed.

### 11.3. Pixel Art Office

Các khu vực có thể thiết kế: - Management Room - Backend Development
Room - Frontend Development Room - QA Room - Review Room - Shared
Workspace

MVP có thể dùng một văn phòng mẫu với các desk cố định. Không bắt buộc
tự động phân phòng theo role.

**Quy tắc phân vị trí:** - Ưu tiên cấu hình do người dùng đặt. - Nếu
chưa có cấu hình, đặt Agent vào khu vực chung. - Không tự suy đoán
chuyên môn từ tên Agent. - Vị trí là yếu tố trình bày, không phải dữ
liệu nghiệp vụ.

### 11.4. Character state mapping

-   WORKING: animation typing.
-   WAITING: animation waiting.
-   IDLE: sitting/resting.
-   COMPLETED: short celebration.
-   FAILED: warning/error pose.
-   STOPPED: inactive.
-   UNKNOWN: question mark hoặc neutral state.

Animation không được làm người dùng hiểu nhầm rằng Agent đang thực sự
làm việc nếu không có event xác nhận.

### 11.5. Agent inspector

Thông tin: - Agent name/ID. - Agent type. - Parent Agent. - Session. -
Current status. - Current tool. - Current task (nếu có). - Last event
time. - Identity confidence. - Recent activities. - Raw/normalized event
metadata ở chế độ developer, sau khi redact.

### 11.6. Dashboard

KPI có thể gồm: - Active sessions. - Active agents. - Working / Idle /
Waiting agents. - Completed/failed tasks. - Tool execution counts. -
Recent errors. - Collector health.

Chỉ hiển thị token/cost nếu có nguồn dữ liệu đáng tin cậy; không tự ước
lượng thành số liệu chính thức.

### 11.7. PixiJS và React

-   PixiJS: sprite, animation, tile/map, camera, pan/zoom, selection.
-   React: navigation, inspector, table, chart, filters, task board,
    settings.
-   Frontend store là lớp trung gian giữa WebSocket/REST và Pixi scene.
-   Pixi scene không gọi trực tiếp backend.

### 11.8. Accessibility và fallback

-   Có list view thay thế Office Canvas.
-   Có trạng thái text/icon, không chỉ dựa vào màu.
-   Có zoom/pan.
-   Hỗ trợ màn hình desktop trước; responsive cơ bản cho tablet.
-   Mục tiêu 60 FPS trên desktop phổ thông, cần đo thực tế với số lượng
    sprite dự kiến.

------------------------------------------------------------------------

## 12. Bảo mật và quyền riêng tư

### 12.1. Local security

-   Backend bind vào localhost trong cấu hình mặc định.
-   Không expose collector port ra LAN/public internet theo mặc định.
-   Có local authentication hoặc access token nội bộ nếu UI/API cần phân
    quyền.
-   CORS giới hạn origin.
-   Giới hạn request body size.
-   Validate mọi event.
-   Không cho event payload quyết định command được thực thi.
-   Không cung cấp arbitrary shell execution từ dashboard.

### 12.2. Data minimization

Mặc định không lưu: - API keys. - Access tokens. - Passwords. - Full
prompt/transcript. - Full tool output. - Nội dung file được đọc/ghi. -
Environment variables.

Chỉ lưu: - Event type. - Timestamp. - Agent/session/task/tool
identifiers cần thiết. - Metadata đã redact. - Thông tin lỗi ở mức an
toàn.

Nếu tương lai cần lưu transcript hoặc tool output, phải có opt-in riêng,
mô tả retention và cơ chế xóa.

### 12.3. Network/privacy

-   Không telemetry ra ngoài theo mặc định.
-   Không cần cloud account.
-   Không cần Anthropic API key.
-   Có thể hoạt động offline sau khi đã cài dependencies/images.
-   Docker image/package update là hoạt động riêng, không phải
    telemetry.

### 12.4. Failure isolation

Nếu dashboard, collector hoặc backend lỗi: - Claude Code vẫn tiếp tục
thực thi theo hành vi bình thường. - Hook command phải kết thúc trong
timeout giới hạn. - Lỗi được ghi nhận cục bộ. - Retry/spool không được
tăng vô hạn. - Khi backend hoạt động lại, collector có thể gửi lại event
còn tồn đọng.

------------------------------------------------------------------------

## 13. Reliability và recovery

### 13.1. Event delivery

MVP nên hỗ trợ: - Timeout. - Retry với exponential backoff và jitter. -
Local spool tùy chọn. - Stable dedupe key. - Idempotent event
processing. - Collector health endpoint.

### 13.2. Reconnect

Khi frontend reconnect: 1. Lấy office snapshot. 2. Lấy sequence/cursor
hiện tại. 3. Replay event thiếu. 4. Đồng bộ lại Agent/session/task
projection. 5. Nếu replay window hết hạn, tải snapshot đầy đủ.

### 13.3. Stale detection

-   Dùng `last_seen_at` và ngưỡng cấu hình.
-   Hiển thị stale indicator.
-   Không chuyển thành FAILED chỉ vì mất event.
-   Có thể chuyển sang UNKNOWN khi không đủ dữ liệu.

### 13.4. Logging

Log cần có: - Correlation ID. - Event ID/dedupe key. - Collector
version. - Runtime session ID đã được bảo vệ phù hợp. - Processing
result. - Error category.

Không log raw payload nhạy cảm.

------------------------------------------------------------------------

## 14. Monorepo và repository structure

``` text
visual-multi-agent-office/
├── apps/
│   ├── web/                 # Next.js frontend
│   ├── api/                 # NestJS backend
│   └── collector/           # Claude Code hook collector
├── packages/
│   ├── contracts/           # Shared event/API contracts
│   ├── database/            # Prisma schema/client
│   ├── domain/              # State machine/domain logic
│   └── config/              # Shared lint/tsconfig
├── assets/
│   ├── sprites/
│   ├── characters/
│   ├── office/
│   └── animations/
├── infrastructure/
│   ├── docker/
│   └── scripts/
├── docs/
│   ├── PRD.md
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── EVENT_CONTRACTS.md
│   ├── SECURITY.md
│   ├── ROADMAP.md
│   └── DEVELOPMENT_GUIDE.md
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### 14.1. Quy ước package

-   `contracts`: event types, DTO schema, API types.
-   `domain`: Agent state machine, projection rules, domain services
    thuần.
-   `database`: Prisma schema, migrations, seed.
-   `config`: TypeScript, ESLint, formatting config dùng chung.

Không để frontend import trực tiếp database package. Không để collector
phụ thuộc toàn bộ NestJS backend.

------------------------------------------------------------------------

## 15. Docker Compose và local deployment

Các service MVP: - `web` - `api` - `postgres` - `collector` (có thể chạy
như process/service local tùy cách cấu hình hook)

Yêu cầu: - Persistent volume cho PostgreSQL. - Healthcheck. -
Environment variables rõ ràng. - Không đưa secret vào image. - Port mặc
định chỉ bind localhost. - Có migration command. - Có setup script cấu
hình Claude Code Hooks. - Có uninstall script. - Có
`docker compose up -d` để khởi động UI/backend/database.

Cần kiểm chứng cách Claude Code gọi hook trên hệ điều hành mục tiêu. Nếu
Claude Code chạy trực tiếp trên host, collector cũng nên có cách chạy
trên host hoặc cấu hình network phù hợp; không giả định container có thể
truy cập host bằng cùng một hostname trên mọi hệ điều hành.

------------------------------------------------------------------------

## 16. Testing strategy

### 16.1. Unit tests

-   Event normalization.
-   Dedupe key generation.
-   Agent state transitions.
-   Session lifecycle.
-   Stale detection.
-   Event ordering.
-   Redaction.
-   Task projection.

### 16.2. Integration tests

-   Hook payload -\> collector -\> API.
-   API -\> PostgreSQL.
-   Duplicate event handling.
-   Invalid payload handling.
-   Retry/replay.
-   WebSocket broadcast.
-   Snapshot recovery.

### 16.3. End-to-end acceptance scenarios

1.  Mở Claude Code và bắt đầu session: session xuất hiện.
2.  Main Agent được nhận diện: nhân vật xuất hiện.
3.  Tạo Subagent: nhân vật con xuất hiện và liên kết parent nếu có dữ
    liệu.
4.  Gọi Read/Bash tool: tool execution hiển thị.
5.  Tool thành công: execution chuyển completed.
6.  Tool thất bại: execution hiển thị failed.
7.  Agent idle: UI thể hiện idle nếu có event xác nhận.
8.  Task hoàn tất: task chuyển completed nếu runtime phát event tương
    ứng.
9.  Session kết thúc: session chuyển ended.
10. Refresh browser: snapshot khôi phục đúng.
11. Tắt backend: Claude Code không bị chặn.
12. Bật backend lại: event tồn đọng được retry nếu spool bật.
13. Gửi event trùng: không tạo bản ghi/projection trùng.
14. Gửi payload không hợp lệ: bị từ chối an toàn.
15. Kiểm tra log/database: không có API key hoặc secret.

------------------------------------------------------------------------

## 17. Roadmap MVP

Ước lượng tham khảo: **4--6 tuần cho một developer**, tùy mức độ hoàn
thiện asset Pixel Art và độ phức tạp thực tế của Claude Code Hooks. Đây
không phải cam kết thời gian.

  -----------------------------------------------------------------------
  Tuần                    Milestone               Deliverables
  ----------------------- ----------------------- -----------------------
  1                       Foundation              Monorepo, Next.js,
                                                  NestJS, PostgreSQL,
                                                  Prisma, Docker Compose,
                                                  contracts

  2                       Claude Code integration Hook Collector, hook
                                                  setup,
                                                  session/subagent/tool
                                                  event ingestion

  3                       Domain & realtime       Agent/session/task
                                                  projections, state
                                                  machine, WebSocket,
                                                  reconnect

  4                       Pixel Office            Office map, sprites,
                                                  animation, selection,
                                                  inspector

  5                       Monitoring              Dashboard, activity
                                                  timeline, tool history,
                                                  task view, error states

  6                       Hardening & release     Integration/E2E tests,
                                                  reliability, security,
                                                  documentation, local
                                                  release
  -----------------------------------------------------------------------

### Milestone acceptance criteria

**M1 -- Foundation** - Có thể chạy stack local. - Database migration
thành công. - Health endpoint hoạt động. - Shared contracts được import
bởi các app.

**M2 -- Runtime integration** - Claude Code hook gửi event đến
collector. - Event được validate và persist. - Hook failure không chặn
Claude Code. - Có deduplication.

**M3 -- Domain/realtime** - Agent/session state được cập nhật. -
WebSocket push event. - Browser reconnect và khôi phục snapshot.

**M4 -- Visual Office** - Pixel office render ổn định. - Agent sprite
phản ánh state. - Click Agent mở inspector. - Có fallback list view.

**M5 -- Monitoring** - Timeline và tool history hiển thị đúng. - Task
hiển thị khi có dữ liệu. - Error/stale/unknown phân biệt rõ.

**M6 -- Release** - Docker Compose chạy được theo hướng dẫn. - Có
setup/uninstall hook. - Có test các tình huống lỗi và reconnect. - Có
tài liệu bảo mật và giới hạn dữ liệu.

------------------------------------------------------------------------

## 18. Rủi ro và quyết định kỹ thuật

  -----------------------------------------------------------------------
  Rủi ro                  Tác động                Hướng xử lý
  ----------------------- ----------------------- -----------------------
  Hook payload thay đổi   Adapter lỗi             Version adapter,
  theo phiên bản                                  contract tests, kiểm
                                                  tra docs chính thức

  Một số event không có   Thiếu trạng thái        Capability detection,
  trong mọi chế độ                                UNKNOWN state

  Event trùng hoặc đến    Sai projection          Dedupe, sequence,
  trễ                                             idempotent processing

  Collector/backend không Mất event               Retry/spool, failure
  chạy                                            isolation

  Thiếu Agent ID ổn định  Gộp nhầm Agent          Fallback identity +
                                                  confidence

  Thiếu dữ liệu giao tiếp Hiển thị sai quan hệ    Chỉ hiển thị observed
                                                  communication

  UI animation gây hiểu   Người dùng hiểu sai     State mapping dựa trên
  nhầm                    trạng thái              event

  Lưu dữ liệu nhạy cảm    Rủi ro bảo mật          Redaction, data
                                                  minimization, opt-in

  Docker network khác     Hook không gọi được     Hỗ trợ host collector
  nhau giữa OS            collector               và tài liệu theo OS
  -----------------------------------------------------------------------

### Các quyết định đã chốt cho MVP

1.  Tên sản phẩm: Visual Multi-Agent Office.
2.  Phong cách: Pixel Art.
3.  Runtime đầu tiên: Claude Code.
4.  Kiến trúc: Local-first.
5.  Không cần API token bổ sung cho dashboard.
6.  Claude Code là execution source of truth.
7.  Tích hợp qua Hooks.
8.  MVP read-only.
9.  Backend Modular Monolith.
10. Docker Compose, không Kubernetes.
11. PostgreSQL, chưa cần Redis.
12. Chỉ thể hiện trạng thái có bằng chứng.

------------------------------------------------------------------------

## 19. Definition of Done cho MVP

MVP được xem là hoàn thành khi:

-   [ ] Người dùng cài và chạy hệ thống local theo README.
-   [ ] Có thể cấu hình Claude Code Hooks mà không làm mất cấu hình hiện
    tại.
-   [ ] Claude Code session được nhận diện.
-   [ ] Agent/Subagent được hiển thị khi có dữ liệu nhận diện.
-   [ ] Tool execution được theo dõi.
-   [ ] Agent status phản ánh đúng event quan sát được.
-   [ ] Pixel Office cập nhật realtime.
-   [ ] Inspector hiển thị thông tin Agent.
-   [ ] Timeline hiển thị event/activity.
-   [ ] Session history tồn tại sau khi browser refresh.
-   [ ] Duplicate event không tạo dữ liệu trùng.
-   [ ] Reconnect phục hồi được trạng thái.
-   [ ] Backend/collector failure không chặn Claude Code.
-   [ ] Không lưu API key, secret hoặc transcript đầy đủ theo mặc định.
-   [ ] Không cần Anthropic API key bổ sung để sử dụng dashboard.
-   [ ] Có tài liệu rõ ràng về những gì hệ thống có thể và không thể
    quan sát.

------------------------------------------------------------------------

## 20. Hướng triển khai đầu tiên

Thứ tự triển khai khuyến nghị:

1.  **Proof of Concept Hooks:** Trước khi làm UI, tạo một hook nhỏ và
    xác nhận payload thực tế từ Claude Code trên máy mục tiêu.
2.  **Event Contract:** Chốt schema nội bộ dựa trên payload đã kiểm
    chứng.
3.  **Collector:** Xây dựng collector tối thiểu, timeout ngắn, có retry
    và dedupe.
4.  **Backend + Database:** Ingest, persist và project
    session/agent/tool state.
5.  **Realtime UI:** Xây dashboard dạng list trước để xác minh dữ liệu.
6.  **Pixel Office:** Chỉ sau khi state/event pipeline đáng tin cậy mới
    kết nối PixiJS.
7.  **Hardening:** Test duplicate, out-of-order, reconnect, collector
    outage và privacy.

**Khuyến nghị quan trọng:** Đừng bắt đầu bằng việc vẽ văn phòng Pixel
Art. Hãy chứng minh trước rằng Claude Code Hooks thực sự cung cấp đủ dữ
liệu để nhận diện session, Agent và tool execution. Khi pipeline dữ liệu
đúng, phần Pixel Art sẽ trở thành lớp visualization thay vì phải đoán
trạng thái.
