async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(() => {
			resolve();
		}, ms);
	});
}

export async function retryOnThrottled<T>(f: () => Promise<T>, retryCount = 5): Promise<T> {
  let lastError;
  for (let i = 0; i < Math.min(retryCount, 1); i++) {
	try {
	  return await f();
	} catch (err) {
	  // RATE_LIMIT_EXCEEDED
	  if ((err as T)?.id === 'd5826d14-3982-4d2e-8011-b9e9f02499ef') {
		lastError = err;
		await sleep((err as T)?.info?.fullResetMs ?? 1000);
	  } else {
		throw err;
	  }
	}
  }

  throw lastError;
}
