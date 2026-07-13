# Security

The message endpoint fails closed until `SET_AGENT_PASSWORD` is linked as a
project secret. Send that value only as an `Authorization: Bearer` token.

SetCloud injects gateway and workflow credentials. Never commit or print them.
Report vulnerabilities privately through the security contact on setcloud.com.
