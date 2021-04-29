/********************************************************************************
 * Copyright (C) 2021 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as bent from 'bent';
import * as semver from 'semver';
import {
    VSXAllVersions,
    VSXExtensionRaw,
    VSXQueryParam,
    VSXQueryResult,
    VSXSearchParam,
    VSXSearchResult
} from './ovsx-types';

const fetchText = bent('GET', 'string', 200);
const fetchJson = bent('GET', { 'Accept': 'application/json' }, 'json', 200);
const postJson = bent('POST', {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
}, 'json', 200);

export interface OVSXClientOptions {
    apiVersion: string
    apiUrl: string
}
export class OVSXClient {

    constructor(readonly options: OVSXClientOptions) { }

    async search(param?: VSXSearchParam): Promise<VSXSearchResult> {
        const searchUri = await this.buildSearchUri(param);
        return this.fetchJson<VSXSearchResult>(searchUri);
    }

    protected async buildSearchUri(param?: VSXSearchParam): Promise<string> {
        let searchUri = '';
        if (param) {
            const query: string[] = [];
            if (param.query) {
                query.push('query=' + encodeURIComponent(param.query));
            }
            if (param.category) {
                query.push('category=' + encodeURIComponent(param.category));
            }
            if (param.size) {
                query.push('size=' + param.size);
            }
            if (param.offset) {
                query.push('offset=' + param.offset);
            }
            if (param.sortOrder) {
                query.push('sortOrder=' + encodeURIComponent(param.sortOrder));
            }
            if (param.sortBy) {
                query.push('sortBy=' + encodeURIComponent(param.sortBy));
            }
            if (param.includeAllVersions) {
                query.push('includeAllVersions=' + param.includeAllVersions);
            }
            if (query.length > 0) {
                searchUri += '?' + query.join('&');
            }
        }
        return new URL(`api/-/search${searchUri}`, this.options!.apiUrl).toString();
    }

    async getExtension(id: string): Promise<VSXExtensionRaw> {
        const apiUri = new URL('api/-/query', this.options!.apiUrl);
        const param: VSXQueryParam = {
            extensionId: id
        };
        const result = await this.postJson<VSXQueryParam, VSXQueryResult>(apiUri.toString(), param);
        if (result.extensions && result.extensions.length > 0) {
            return result.extensions[0];
        }
        throw new Error(`Extension with id ${id} not found at ${apiUri}`);
    }

    /**
     * Get all versions of the given extension.
     * @param id the requested extension id.
     */
    async getAllVersions(id: string): Promise<VSXExtensionRaw[]> {
        const apiUri = new URL('api/-/query', this.options!.apiUrl);
        const param: VSXQueryParam = {
            extensionId: id,
            includeAllVersions: true,
        };
        const result = await this.postJson<VSXQueryParam, VSXQueryResult>(apiUri.toString(), param);
        if (result.extensions && result.extensions.length > 0) {
            return result.extensions;
        }
        throw new Error(`Extension with id ${id} not found at ${apiUri}`);
    }

    protected fetchJson<R>(url: string): Promise<R> {
        return fetchJson(url) as Promise<R>;
    }

    protected postJson<P, R>(url: string, payload: P): Promise<R> {
        return postJson(url, JSON.stringify(payload)) as Promise<R>;
    }

    fetchText(url: string): Promise<string> {
        return fetchText(url);
    }

    /**
     * Get the latest compatible extension version.
     * - an extension satisfies compatibility if its `engines.vscode` version is supported.
     * @param id the extension id.
     *
     * @returns the data for the latest compatible extension version if available, else `undefined`.
     */
    async getLatestCompatibleExtensionVersion(id: string): Promise<VSXExtensionRaw | undefined> {
        const extensions = await this.getAllVersions(id);
        for (let i = 0; i < extensions.length; i++) {
            const extension: VSXExtensionRaw = extensions[i];
            if (extension.engines && this.isEngineSupported(extension.engines.vscode)) {
                return extension;
            }
        }
    }

    /**
     * Get the latest compatible version of an extension.
     * @param versions the `allVersions` property.
     *
     * @returns the latest compatible version of an extension if it exists, else `undefined`.
     */
    getLatestCompatibleVersion(versions: VSXAllVersions[]): VSXAllVersions | undefined {
        for (const version of versions) {
            if (this.isEngineSupported(version.engines?.vscode)) {
                return version;
            }
        }
    }

    /**
     * Determine if the engine is supported by the application.
     * @param engine the engine.
     *
     * @returns `true` if the engine satisfies the API version.
     */
    protected isEngineSupported(engine?: string): boolean {
        if (!engine) {
            return false;
        }

        // Determine engine compatibility.
        if (engine === '*') {
            return true;
        } else {
            return semver.satisfies(this.options!.apiVersion, engine);
        }
    }

}
