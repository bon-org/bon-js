import * as util from "util";
import {$a, $z, assert} from "./utils";

export function Atom(Str: string) {
    return Symbol.for(Str);
}

export class Tuple {
    public readonly value: any[];

    constructor(...args: any[]) {
        this.value = args;
    }
}

export class Binary {
    public readonly value: Uint8Array;

    constructor(value: Uint8Array) {
        this.value = value;
    }

    /**@deprecated slow*/
    toString(): string {
        let res = "";
        this.value.forEach(x => res += String.fromCharCode(x));
        return res;
    }
}

export function to_binary(value: Binary | Uint8Array): Binary {
    return (value instanceof Binary) ? value : new Binary(value);
}

export class List {
    public readonly value;
    public readonly tail: List;

    constructor(value, tail: List) {
        this.value = value;
        this.tail = tail;
    }

    append(H) {
        return new List(H, this);
    }
}

export const EmptyList = new List(undefined, undefined);

export namespace lists {
    export function reverse(list: List) {
        return reverse2(list, EmptyList);
    }

    function reverse2(list: List, acc: List) {
        return list == EmptyList ? acc : reverse2(list.tail, acc.append(list.value));
    }

    export function walk(list: List, f: (x) => void) {
        if (list == EmptyList) {
            return;
        }
        f(list.value);
        return walk(list.tail, f);
    }

    export function split(Size: int, Res: List) {
        let Acc = EmptyList;
        for (; Size > 0; Size--) {
            Acc = Acc.append(Res.value);
            Res = Res.tail;
        }
        return [reverse(Acc), Res];
    }

    export function foldl<A>(F: (c: any, acc: A) => A, Acc: A, L: List): A {
        for (; ;) {
            if (L === EmptyList) {
                return Acc;
            }
            Acc = F(L.value, Acc);
            L = L.tail;
        }
    }
}

export namespace format {
    export function list(list: List) {
        if (list == EmptyList) {
            return "[]";
        }
        if (list.tail == EmptyList) {
            return "[" + util.inspect(list.value) + "]";
        }
        let res = "[" + util.inspect(list.value);
        lists.walk(list.tail, x => res += "," + util.inspect(x));
        return res + "]";
    }

    export function tuple(tuple: Tuple) {
        const arr = tuple.value;
        const ss = arr.map(x => util.inspect(x));
        return "{" + ss.join(",") + "}";
    }

    export function binary(bin: Binary | Uint8Array) {
        const data: Uint8Array = (bin as Binary).value || bin as Uint8Array;
        return "<<" + data.join(",") + ">>";
    }

    export function atom(atom: symbol) {
        const name = Symbol.keyFor(atom);
        const c = name.charCodeAt(0);
        return $a <= c && c <= $z
            ? name
            : "'" + name + "'";
    }

    export function symbol(s: symbol) {
        return atom(s);
    }

    export function map(map: map) {
        const acc = new Array(map.size);
        let i = 0;
        map.forEach((v, k) => {
            acc[i] = util.inspect(k) + " => " + util.inspect(v);
            i++;
        });
        return "#{" + (acc.join(",")) + "}";
    }

    export function object(o: any) {
        return "{ "
            + Object.keys(o)
                .map(k => util.inspect(k) + ": " + util.inspect(o[k]))
                .join(", ")
            + " }";
    }
}

export function inject_inspect() {
    const ori = util.inspect;
    const u = util as any;
    u["inspect"] = function () {
        const x = arguments[0];
        const type = type_of(x);
        return typeof format[type] === "function"
            ? format[type](x)
            : ori.apply(util, arguments);
    };
}

inject_inspect();

/**@deprecated slow*/
export function array_to_list(Arr: any[]) {
    const res = Arr.reduce((acc, c) => acc.append(c), EmptyList);
    return lists.reverse(res);
}

export function list_to_array(list: List): any[] {
    const res = [];
    lists.walk(list, x => res.push(x));
    return res;
}

export function list_to_set(list: List): Set<any> {
    const res = new Set();
    lists.walk(list, x => res.add(x));
    return res;
}

export function list_to_string(list: List) {
    let res = "";
    lists.walk(list, x => res += String.fromCharCode(x));
    return res;
}

export function list_to_atom(list: List) {
    return Atom(list_to_string(list));
}

export function list_to_tuple(list: List): Tuple {
    return new Tuple(...list_to_array(list));
}

export function tuple_to_list(tuple: Tuple): List {
    return array_to_list(tuple.value);
}

export function array_to_tuple(Arr: any[]) {
    return new Tuple(...Arr);
}

export function list(...args) {
    let acc = EmptyList;
    for (let i = args.length - 1; i >= 0; i--) {
        acc = acc.append(args[i]);
    }
    return acc;
}

export function tuple(...args) {
    return array_to_tuple(args);
}

export function string_to_binary(str: string): Binary {
    return new Binary(Buffer.from(str));
}

export type IOList = string;

export function integer_to_iolist(x: int): IOList {
    assert(type_of(x) == "int", "expect integer: " + util.inspect(x));
    return x.toString();
}

export function type_of(Data) {
    if (Data == null) {
        return "null";
    }
    if (Array.isArray(Data)) {
        return "array";
    }
    if (Data instanceof Tuple) {
        return "tuple";
    }
    if (Data instanceof Uint8Array) {
        return "binary";
    }
    if (Data instanceof Binary) {
        return "binary";
    }
    if (typeof Data === "string") {
        return "iolist";
    }
    if (Data instanceof List) {
        return "list";
    }
    if (Data instanceof Set) {
        return "set";
    }
    if (Data instanceof Map) {
        return "map";
    }
    if (Data instanceof Object) {
        return "object";
    }
    if (Number.isInteger(Data)) {
        return "int";
    }
    if (Number.isFinite(Data)) {
        return "float";
    }
    if (Number.isNaN(Data)) {
        throw new TypeError("NaN is not supported");
    }
    return typeof Data;
}

/** TODO speed up **/
export function iolist_to_binary(List0: IOList | List): Binary {
    if (typeof List0 === "string") {
        return new Binary(Buffer.from(List0));
    }
    if (List0 instanceof List) {
        return iolist_to_binary(list_to_string(List0));
    }
    throw new Error("bad_arg: " + util.inspect(List0));
}

export function binary_to_list(Bin: Binary): List {
    const res = Bin.value.reduce((acc, c) => acc.append(c), EmptyList);
    return lists.reverse(res);
}

export function iolist_to_list(Bin: IOList): List {
    let Acc = EmptyList;
    for (let i = Bin.length - 1; i >= 0; i--) {
        Acc = Acc.append(Bin.charCodeAt(i));
    }
    return Acc;
}

export function byte_size(Bin: Binary): number {
    return Bin.value.byteLength;
}

export type float = number;
export type int = number;
export type atom = symbol;
export type map = Map<any, any>;
export type set = Set<any>;

export function equal(A, B): boolean {
    const A_Type = type_of(A);
    const B_Type = type_of(B);
    if (A_Type != B_Type) {
        if (A_Type == "array" && B_Type == "list") {
            return equal_array_list(A, B);
        } else if (B_Type == "array" && A_Type == "list") {
            return equal_array_list(B, A);
        } else if (A_Type == "object" && B_Type == "map") {
            return equal_object_map(A, B);
        } else if (B_Type == "object" && A_Type == "map") {
            return equal_object_map(B, A);
        }
        return false;
    }
    switch (A_Type) {
        case "array":
            return equal_array(A, B);
        case "list":
            return equal_list(A, B);
        case "binary":
            return equal_array(A.value, B.value);
        case "tuple":
            return equal_array(A.value, B.value);
        case "set":
            return equal_set(A, B);
        case "map":
            return equal_map(A, B);
        default:
            return A == B;
    }
}

export function equal_array_list(A: any[], B: List): boolean {
    let B_Head = (B as List).value;
    let B_Tail = (B as List).tail;
    /* TODO check if A and B are of same length, make sure handle short B correctly */
    const All = A.every(A_Head => {
        if (equal(A_Head, B_Head)) {
            B_Head = B_Tail.value;
            B_Tail = B_Tail.tail;
            return true;
        }
        return false;
    });
    return All && B_Tail == EmptyList; // or b tail equal to undefined?
}

export function equal_array(xs: any[], ys: any[]): boolean {
    return xs.length == ys.length && xs.every((x, i) => equal(x, ys[i]));
}

export function equal_set(xs: set, ys: set): boolean {
    if (xs.size !== ys.size) {
        return false;
    }
    for (const x of xs) {
        if (!ys.has(x)) {
            return false;
        }
    }
    return true;
}

export function equal_map(xs: map, ys: map): boolean {
    if (xs.size !== ys.size) {
        return false;
    }
    for (const [key, value] of xs.entries()) {
        if (!ys.has(key)) {
            return false;
        }
        if (!equal(value, ys.get(key))) {
            return false;
        }
    }
    return true;
}

export function equal_list(List_A: List, List_B: List): boolean {
    let A_Head = List_A.value;
    let B_Head = List_B.value;
    let A_Tail = List_A.tail;
    let B_Tail = List_B.tail;
    for (; ;) {
        if (equal(A_Head, B_Head)) {
            A_Head = A_Tail.value;
            A_Tail = A_Tail.tail;
            B_Head = B_Tail.value;
            B_Tail = B_Tail.tail;
        } else {
            return false;
        }
    }
}

export function equal_object_map(A: any, B: map): boolean {
    const keys = Object.keys(A);
    if (keys.length !== B.size) {
        return false;
    }
    try {
        B.forEach((B_V, B_K) => {
            if (!(B_K in A)) {
                throw false;
            }
            const A_V = A[B_K];
            if (!equal(A_V, B_V)) {
                throw false;
            }
        });
        return true;
    } catch (e) {
        return e;
    }
}
