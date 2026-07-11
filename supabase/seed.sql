-- Sample question bank content for local testing.
-- created_by is left null (system-seeded, not tied to a specific admin account).

insert into public.question_bank
  (subject, role_tags, company_tags, question_text, reference_answer, difficulty, question_type)
values
  (
    'dsa',
    '{sde,software_engineer}', '{tcs,infosys,wipro,accenture,amazon}',
    'Explain the difference between an array and a linked list, and when you would choose one over the other.',
    'Arrays store elements in contiguous memory with O(1) indexed access but O(n) insertion/deletion in the middle and a fixed (or costly-to-resize) size. Linked lists store elements in nodes with pointers, giving O(1) insertion/deletion given a node reference but O(n) access. Choose arrays for frequent random access and cache-friendly iteration; choose linked lists when frequent insertions/deletions at arbitrary positions are needed and size is unpredictable.',
    'easy', 'technical'
  ),
  (
    'dsa',
    '{sde,software_engineer}', '{tcs,infosys,wipro,accenture,amazon}',
    'How would you detect a cycle in a linked list?',
    'Use Floyd''s cycle detection (slow/fast pointer): advance a slow pointer one step and a fast pointer two steps; if they meet, a cycle exists. This runs in O(n) time and O(1) space, compared to O(n) space with a hash set of visited nodes.',
    'medium', 'technical'
  ),
  (
    'oops',
    '{sde,software_engineer}', '{tcs,infosys,wipro,accenture}',
    'Explain polymorphism with a real-world example.',
    'Polymorphism lets objects of different classes respond to the same interface/method call in class-specific ways. Example: a `Shape` base class with an `area()` method overridden by `Circle` and `Rectangle` subclasses — calling `shape.area()` behaves differently depending on the actual object type at runtime (runtime/dynamic polymorphism), while method overloading is compile-time/static polymorphism.',
    'easy', 'technical'
  ),
  (
    'dbms',
    '{sde,software_engineer}', '{tcs,infosys,wipro,accenture}',
    'What is normalization and why is it used?',
    'Normalization organizes relational data to reduce redundancy and avoid update/insert/delete anomalies by decomposing tables per rules (1NF: atomic columns, 2NF: no partial dependency on part of a composite key, 3NF: no transitive dependency on non-key attributes). Trade-off: over-normalization can hurt read performance, requiring joins.',
    'medium', 'technical'
  ),
  (
    'hr',
    '{sde,software_engineer,business_analyst}', '{tcs,infosys,wipro,accenture,amazon}',
    'Tell me about yourself.',
    'A strong answer briefly covers: current academic/professional background, 1-2 relevant projects or experiences with measurable impact, and why this role/company is a good fit — structured concisely (60-90 seconds), avoiding a full life history.',
    'easy', 'hr'
  ),
  (
    'hr',
    '{sde,software_engineer,business_analyst}', '{tcs,infosys,wipro,accenture,amazon}',
    'Describe a time you faced a conflict in a team project and how you resolved it.',
    'Best answered using the STAR method: Situation (context of the team project), Task (what needed resolving), Action (specific steps taken to address the conflict, e.g. facilitating a discussion, proposing a compromise), Result (measurable/positive outcome and what was learned). Avoid vague generalities or blaming others.',
    'medium', 'behavioral'
  ),
  (
    'communication',
    '{sde,software_engineer,business_analyst}', '{tcs,infosys,wipro,accenture,amazon}',
    'Why should we hire you over other candidates?',
    'A strong answer connects specific skills/experiences directly to the role''s requirements, cites concrete evidence (projects, quantifiable results), and conveys genuine enthusiasm for the company/role without generic claims like "I am hardworking" without backing.',
    'easy', 'hr'
  ),
  (
    'system_design',
    '{sde,software_engineer}', '{amazon,google}',
    'How would you design a URL shortening service at a high level?',
    'Key points: a hash/base62 encoding of an auto-incrementing ID (or hash of the URL) to generate short codes, a key-value store (e.g. DynamoDB/Redis) mapping short code to long URL, handling collisions, a redirect service (HTTP 301/302), analytics/click tracking, and considerations for scale (caching hot URLs, database sharding) and custom aliases/expiry.',
    'hard', 'technical'
  );
