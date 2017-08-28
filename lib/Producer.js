'use strict';

const Logger = require('./Logger');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const errors = require('./errors');

const logger = new Logger('Producer');

class Producer extends EnhancedEventEmitter
{
	constructor(internal, data, channel)
	{
		super(logger);

		logger.debug('constructor()');

		// Closed flag.
		this._closed = false;

		// Internal data.
		// - .roomId
		// - .peerId
		// - .producerId
		// - .transportId
		this._internal = internal;

		// Producer data.
		// - .kind
		// - .transport
		// - .rtpParameters
		// - .rtpMapping
		this._data = data;

		// Channel instance.
		this._channel = channel;

		// Locally paused flag.
		// @type {Boolean}
		this._locallyPaused = false;

		// Remotely paused flag.
		// @type {Boolean}
		this._remotelyPaused = false;

		// Subscribe to notifications.
		this._channel.on(this._internal.producerId, (event, data2, buffer) =>
		{
			switch (event)
			{
				case 'close':
				{
					this.close(undefined, false);

					break;
				}

				case 'rtpraw':
				{
					this.emit('rtpraw', buffer);

					break;
				}

				case 'rtpobject':
				{
					// Append the binary buffer into `object.payload`.
					data2.object.payload = buffer;

					this.emit('rtpobject', data2.object);

					break;
				}

				default:
					logger.error('ignoring unknown event "%s"', event);
			}
		});

		// Subscribe to new events.
		this.on('newListener', (event) =>
		{
			switch (event)
			{
				case 'rtpraw':
				{
					// Send Channel request.
					this._channel.request(
						'producer.setRtpRawEvent', this._internal, { enabled: true })
						.then(() =>
						{
							logger.debug('"producer.setRtpRawEvent" request succeeded');
						})
						.catch((error) =>
						{
							logger.error(
								'"producer.setRtpRawEvent" request failed: %s', String(error));
						});

					break;
				}

				case 'rtpobject':
				{
					// Send Channel request.
					this._channel.request(
						'producer.setRtpObjectEvent', this._internal, { enabled: true })
						.then(() =>
						{
							logger.debug('"producer.setRtpObjectEvent" request succeeded');
						})
						.catch((error) =>
						{
							logger.error(
								'"producer.setRtpObjectEvent" request failed: %s', String(error));
						});

					break;
				}
			}
		});

		// Subscribe to events removal.
		this.on('removeListener', (event) =>
		{
			switch (event)
			{
				case 'rtpraw':
				{
					// Ignore if there are other remaining listeners.
					if (this.listenerCount('rtpraw'))
						return;

					// Send Channel request.
					this._channel.request(
						'producer.setRtpRawEvent', this._internal, { enabled: false })
						.then(() =>
						{
							logger.debug('"producer.setRtpRawEvent" request succeeded');
						})
						.catch((error) =>
						{
							logger.error(
								'"producer.setRtpRawEvent" request failed: %s', String(error));
						});

					break;
				}

				case 'rtpobject':
				{
					// Ignore if there are other remaining listeners.
					if (this.listenerCount('rtpobject'))
						return;

					// Send Channel request.
					this._channel.request(
						'producer.setRtpObjectEvent', this._internal, { enabled: false })
						.then(() =>
						{
							logger.debug('"producer.setRtpObjectEvent" request succeeded');
						})
						.catch((error) =>
						{
							logger.error(
								'"producer.setRtpObjectEvent" request failed: %s', String(error));
						});

					break;
				}
			}
		});
	}

	get id()
	{
		return this._internal.producerId;
	}

	get closed()
	{
		return this._closed;
	}

	get kind()
	{
		return this._data.kind;
	}

	get transport()
	{
		return this._data.transport;
	}

	get rtpParameters()
	{
		return this._data.rtpParameters;
	}

	get rtpMapping()
	{
		return this._data.rtpMapping;
	}

	/**
	 * Whether the Producer is locally paused.
	 *
	 * @return {Boolean}
	 */
	get locallyPaused()
	{
		return this._locallyPaused;
	}

	/**
	 * Whether the Producer is remotely paused.
	 *
	 * @return {Boolean}
	 */
	get remotelyPaused()
	{
		return this._remotelyPaused;
	}

	/**
	 * Whether the Producer is paused.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._locallyPaused || this._remotelyPaused;
	}

	/**
	 * Close the Producer.
	 *
	 * @param {Any} [appData] - App custom data.
	 * @param {Boolean} [notifyChannel=true] - Private.
	 */
	close(appData, notifyChannel = true)
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;

		this.emit(
			'@notify', 'producerClosed', { id: this.id, appData });

		this.emit('@close');
		this.safeEmit('close', 'local', appData);

		this._destroy(notifyChannel);
	}

	/**
	 * The remote Producer was closed.
	 * Invoked via remote notification.
	 *
	 * @private
	 *
	 * @param {Any} [appData] - App custom data.
	 * @param {Boolean} [notifyChannel=true] - Private.
	 */
	remoteClose(appData, notifyChannel = true)
	{
		logger.debug('remoteClose()');

		if (this.closed)
			return;

		this._closed = true;

		this.emit('@close');
		this.safeEmit('close', 'remote', appData);

		this._destroy(notifyChannel);
	}

	_destroy(notifyChannel = true)
	{
		// Remove notification subscriptions.
		this._channel.removeAllListeners(this._internal.producerId);

		if (notifyChannel)
		{
			// Send Channel request.
			this._channel.request('producer.close', this._internal)
				.then(() =>
				{
					logger.debug('"producer.close" request succeeded');
				})
				.catch((error) =>
				{
					logger.error('"producer.close" request failed: %s', String(error));
				});
		}
	}

	/**
	 * Dump the Producer.
	 *
	 * @return {Promise}
	 */
	dump()
	{
		logger.debug('dump()');

		if (this._closed)
			return Promise.reject(new errors.InvalidStateError('Producer closed'));

		return this._channel.request('producer.dump', this._internal)
			.then((data) =>
			{
				logger.debug('"producer.dump" request succeeded');

				return data;
			})
			.catch((error) =>
			{
				logger.error('"producer.dump" request failed: %s', String(error));

				throw error;
			});
	}

	/**
	 * Start receiving media from the remote Producer.
	 *
	 * @param {RTCRtpParameters} rtpParameters - Receiving RTP parameters.
	 * @param {Object} rtpMapping.
	 *
	 * @return {Promise} Resolves to this.
	 */
	receive(rtpParameters, rtpMapping)
	{
		logger.debug('receive()');

		if (this._closed)
			return Promise.reject(new errors.InvalidStateError('Producer closed'));

		const data =
		{
			rtpParameters,
			rtpMapping
		};

		// Send Channel request.
		return this._channel.request('producer.receive', this._internal, data)
			.then(() =>
			{
				logger.debug('"producer.receive" request succeeded');

				this._data.rtpParameters = rtpParameters;
				this._data.rtpMapping = rtpMapping;

				return this;
			})
			.catch((error) =>
			{
				logger.error('"producer.receive" request failed: %s', String(error));

				throw error;
			});
	}

	/**
	 * Pauses receiving media.
	 *
	 * @param {Any} [appData] - App custom data.
	 *
	 * @return {Boolean} true if paused.
	 */
	pause(appData)
	{
		logger.debug('pause()');

		if (this._closed)
		{
			logger.error('pause() | Producer closed');

			return false;
		}
		else if (this._locallyPaused)
		{
			return true;
		}

		this.emit(
			'@notify', 'producerPaused', { id: this.id, appData });

		this._locallyPaused = true;

		// Send Channel request.
		this._channel.request('producer.pause', this._internal)
			.then(() =>
			{
				logger.debug('"producer.pause" request succeeded');
			})
			.catch((error) =>
			{
				logger.error('"producer.pause" request failed: %s', String(error));
			});

		this.safeEmit('pause', 'local', appData);

		// Return true if really paused.
		return this.paused;
	}

	/**
	 * The remote Producer was paused.
	 * Invoked via remote notification.
	 *
	 * @private
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	remotePause(appData)
	{
		logger.debug('remotePause()');

		if (this._closed || this._remotelyPaused)
			return;

		this._remotelyPaused = true;

		// Send Channel request.
		this._channel.request('producer.pause', this._internal)
			.then(() =>
			{
				logger.debug('"producer.pause" request succeeded');
			})
			.catch((error) =>
			{
				logger.error('"producer.pause" request failed: %s', String(error));
			});

		this.safeEmit('pause', 'remote', appData);
	}

	/**
	 * Resumes receiving media.
	 *
	 * @param {Any} [appData] - App custom data.
	 *
	 * @return {Boolean} true if not paused.
	 */
	resume(appData)
	{
		logger.debug('resume()');

		if (this._closed)
		{
			logger.error('resume() | Producer closed');

			return false;
		}
		else if (!this._locallyPaused)
		{
			return true;
		}

		this.emit(
			'@notify', 'producerResumed', { id: this.id, appData });

		this._locallyPaused = false;

		if (!this._remotelyPaused)
		{
			// Send Channel request.
			this._channel.request('producer.resume', this._internal)
				.then(() =>
				{
					logger.debug('"producer.resume" request succeeded');
				})
				.catch((error) =>
				{
					logger.error('"producer.resume" request failed: %s', String(error));
				});
		}

		this.safeEmit('resume', 'local', appData);

		// Return true if not paused.
		return !this.paused;
	}

	/**
	 * The remote Producer was resumed.
	 * Invoked via remote notification.
	 *
	 * @private
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	remoteResume(appData)
	{
		logger.debug('remoteResume()');

		if (this._closed || !this._remotelyPaused)
			return;

		this._remotelyPaused = false;

		if (!this._locallyPaused)
		{
			// Send Channel request.
			this._channel.request('producer.resume', this._internal)
				.then(() =>
				{
					logger.debug('"producer.resume" request succeeded');
				})
				.catch((error) =>
				{
					logger.error('"producer.resume" request failed: %s', String(error));
				});
		}

		this.safeEmit('resume', 'remote', appData);
	}
}

module.exports = Producer;