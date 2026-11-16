export const event = (method: string, path: string, body?: unknown) => ({
  rawPath: path,
  requestContext: { requestId: 'test', http: { method } },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const authedEvent = (
  method: string,
  path: string,
  body?: unknown,
  claims: Record<string, unknown> = {
    sub: 'cognito-sub',
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool',
    client_id: 'android',
  },
) => ({
  rawPath: path,
  requestContext: {
    requestId: 'test',
    http: { method },
    authorizer: { jwt: { claims } },
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
