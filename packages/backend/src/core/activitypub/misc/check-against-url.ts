/*
 * SPDX-FileCopyrightText: dakkar and sharkey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { IObject } from '../type.js';

export enum FetchAllowSoftFailMask {
	// Allow no softfail flags
	Strict = 0,
	// The values in tuple (requestUrl, finalUrl, objectId) are not all identical
	//
	// This condition is common for user-initiated lookups but should not be allowed in federation loop
	//
	// Allow variations:
	//   good example: https://alice.example.com/@user -> https://alice.example.com/user/:userId
	//   problematic example: https://alice.example.com/redirect?url=https://bad.example.com/ -> https://bad.example.com/ -> https://alice.example.com/somethingElse
	NonCanonicalId = 1 << 0,
	// Allow the final object to be at most one subdomain deeper than the request URL, similar to SPF relaxed alignment
	//
	// Currently no code path allows this flag to be set, but is kept in case of future use as some niche deployments do this, and we provide a pre-reviewed mechanism to opt-in.
	//
	// Allow variations:
	//   good example: https://example.com/@user -> https://activitypub.example.com/@user { id: 'https://activitypub.example.com/@user' }
	//   problematic example: https://example.com/@user -> https://untrusted.example.com/@user { id: 'https://untrusted.example.com/@user' }
	MisalignedOrigin = 1 << 1,
	// The requested URL has a different host than the returned object ID, although the final URL is still consistent with the object ID
	//
	// This condition is common for user-initiated lookups using an intermediate host but should not be allowed in federation loops
	//
	// Allow variations:
	//   good example: https://alice.example.com/@user@bob.example.com -> https://bob.example.com/@user { id: 'https://bob.example.com/@user' }
	//   problematic example: https://alice.example.com/definitelyAlice -> https://bob.example.com/@somebodyElse { id: 'https://bob.example.com/@somebodyElse' }
	CrossOrigin = 1 << 2 | MisalignedOrigin,
	// Allow all softfail flags
	//
	// do not use this flag on released code
	Any = ~0,
}
