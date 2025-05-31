async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(() => {
			resolve();
		}, ms);
	});
}

export async function retryOnThrottled<T>(f: ()=>Promise<T>, retryCount = 5): Promise<T> {
	let lastOk = false;
	let lastResultOrError: T;
	for (let i = 0; i < retryCount; i++) {
		const [ok, resultOrError] = await f()
			.then(result => [true, result])
			.catch(err => [false, err]);

		lastOk = ok;
		lastResultOrError = resultOrError;

		if (ok) {
			break;
		}

		// RATE_LIMIT_EXCEEDED
		if (resultOrError?.id === 'd5826d14-3982-4d2e-8011-b9e9f02499ef') {
			await sleep(resultOrError?.info?.fullResetMs ?? 1000);
			continue;
		}

		// Throw for non-throttling errors
		throw resultOrError;
	}

	if (lastOk) {
		return lastResultOrError!;
	} else {
		// Give up after getting throttled too many times
		throw lastResultOrError!;
	}
}