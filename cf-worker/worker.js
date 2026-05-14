function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    let body;
    try { body = await request.json(); } catch {
      return json({ error: 'Invalid JSON' }, 400, cors);
    }

    try {
      // ── Submit: prompt가 있으면 BFL에 제출하고 task id 반환
      if (body.prompt) {
        const res = await fetch('https://api.bfl.ai/v1/flux-2-klein-9b', {
          method: 'POST',
          headers: { 'x-key': env.BFL_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: body.prompt,
            width: 1024,
            height: 1024,
            output_format: 'jpeg',
            safety_tolerance: 5
          })
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          return json({ error: e.detail || `BFL 오류 ${res.status}` }, res.status, cors);
        }
        const { id } = await res.json();
        return json({ id }, 200, cors);
      }

      // ── Check: id가 있으면 결과 확인
      if (body.id) {
        const res = await fetch(`https://api.bfl.ai/v1/get_result?id=${body.id}`, {
          headers: { 'x-key': env.BFL_API_KEY }
        });
        const result = await res.json();

        if (result.status === 'Ready') {
          // 이미지 URL → base64 변환 후 반환
          const imgRes = await fetch(result.result.sample);
          const buf = await imgRes.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          const b64 = btoa(binary);
          return json({ status: 'Ready', b64, mime: 'image/jpeg' }, 200, cors);
        }

        if (['Error', 'Failed', 'Content Moderated', 'Request Moderated'].includes(result.status)) {
          return json({ status: 'Error', error: '생성 실패: ' + result.status }, 200, cors);
        }

        return json({ status: 'Pending' }, 200, cors);
      }

      return json({ error: 'prompt 또는 id가 필요합니다' }, 400, cors);

    } catch (err) {
      return json({ error: err.message }, 500, cors);
    }
  }
};
