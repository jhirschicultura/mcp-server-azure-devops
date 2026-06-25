import axios from 'axios';
import { getWikiClient } from './azure-devops';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WikiClient base urls', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DEVOPS_AUTH_METHOD: 'pat',
      AZURE_DEVOPS_PAT: 'test-pat',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses server base url when organizationUrl points to Azure DevOps Server', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        value: [],
      },
    });

    const client = await getWikiClient({
      organizationUrl: 'https://ado.local/tfs/DefaultCollection',
      projectId: 'ProjectX',
    });

    await client.listWikiPages('ProjectX', 'wiki1');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://ado.local/tfs/DefaultCollection/ProjectX/_apis/wiki/wikis/wiki1/pagesbatch',
      expect.any(Object),
      expect.objectContaining({
        params: {
          'api-version': '7.1',
        },
        headers: expect.any(Object),
      }),
    );
  });
});

describe('WikiClient page path encoding', () => {
  const originalEnv = process.env;
  // A path with a non-ASCII char and a space — the case from the bug report.
  const rawPath = '/Startsida/Onboarding för utvecklare';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DEVOPS_AUTH_METHOD: 'pat',
      AZURE_DEVOPS_PAT: 'test-pat',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('createPage passes the raw path so axios encodes it exactly once', async () => {
    mockedAxios.put.mockResolvedValue({ data: {}, headers: {}, status: 201 });

    const client = await getWikiClient({
      organizationUrl: 'https://ado.local/tfs/DefaultCollection',
      projectId: 'ProjectX',
    });

    await client.createPage('# content', 'ProjectX', 'wiki1', rawPath);

    const params = mockedAxios.put.mock.calls[0][2]?.params as Record<
      string,
      string
    >;
    // The path must be handed over un-encoded; pre-encoding here is what caused
    // the %2520 double-encoding once axios re-encodes query params.
    expect(params.path).toBe(rawPath);
    expect(params.path).not.toContain('%');
  });

  it('updatePage passes the raw path so axios encodes it exactly once', async () => {
    // getPage runs first; treat the page as not yet existing.
    mockedAxios.get.mockRejectedValue({
      response: { status: 404, data: {} },
      message: 'not found',
    });
    mockedAxios.put.mockResolvedValue({ data: {}, headers: {}, status: 201 });

    const client = await getWikiClient({
      organizationUrl: 'https://ado.local/tfs/DefaultCollection',
      projectId: 'ProjectX',
    });

    await client.updatePage(
      { content: '# content' },
      'ProjectX',
      'wiki1',
      rawPath,
    );

    const params = mockedAxios.put.mock.calls[0][2]?.params as Record<
      string,
      string
    >;
    expect(params.path).toBe(rawPath);
    expect(params.path).not.toContain('%');
  });
});
