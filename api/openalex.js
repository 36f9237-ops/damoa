const OPENALEX_API = 'https://api.openalex.org/works';
const ALLOWED_SELECT = new Set([
  'id', 'doi', 'title', 'authorships', 'publication_year',
  'primary_location', 'locations', 'abstract_inverted_index', 'type',
  'open_access', 'best_oa_location', 'language', 'ids'
]);
const ALLOWED_FILTERS = /^(?:from_publication_date:\d{4}-\d{2}-\d{2}|to_publication_date:\d{4}-\d{2}-\d{2}|language:[a-z|]+|is_oa:true)$/;

function json(status, body) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function GET(request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return json(403, { error: '허용되지 않은 요청입니다.' });
    }

    const apiKey = process.env.OPENALEX_API_KEY?.trim();
    if (!apiKey || !/^[\x21-\x7e]{8,512}$/.test(apiKey)) {
      return json(503, { error: 'OpenAlex 서버 키 설정을 확인해 주세요.' });
    }

    const incoming = new URL(request.url).searchParams;
    const search = incoming.get('search')?.trim() || '';
    const perPage = Number(incoming.get('per_page') || 20);
    const sort = incoming.get('sort') || 'relevance_score:desc';
    const select = (incoming.get('select') || '').split(',').filter(Boolean);
    const filter = incoming.get('filter') || '';

    if (!search || search.length > 300 ||
        !Number.isInteger(perPage) || perPage < 1 || perPage > 20 ||
        !/^[a-z_]+:(?:asc|desc)$/.test(sort) ||
        !select.length || select.length > ALLOWED_SELECT.size ||
        select.some(field => !ALLOWED_SELECT.has(field)) ||
        (filter && filter.split(',').some(part => !ALLOWED_FILTERS.test(part)))) {
      return json(400, { error: '검색 조건을 확인해 주세요.' });
    }

    const params = new URLSearchParams({
      search,
      per_page: String(perPage),
      sort,
      select: select.join(','),
      api_key: apiKey
    });
    if (filter) params.set('filter', filter);

    const upstream = await fetch(OPENALEX_API + '?' + params.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
      redirect: 'error'
    });
    if (!upstream.ok) {
      return json(upstream.status === 429 ? 429 : 502, {
        error: upstream.status === 429
          ? 'OpenAlex 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
          : 'OpenAlex에서 검색 결과를 가져오지 못했습니다.'
      });
    }

    const data = await upstream.json();
    return json(200, data);
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return json(504, { error: 'OpenAlex 응답 시간이 초과됐습니다. 다시 시도해 주세요.' });
    }
    return json(502, { error: 'OpenAlex 검색 서버에 연결하지 못했습니다.' });
  }
}
