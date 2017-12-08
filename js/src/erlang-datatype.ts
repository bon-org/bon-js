import * as util from "util";
import {$a, $z, assert, char_code, debug, swap} from "./utils";

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
            debug("foldl:", util.inspect({Acc, L}));
            if (L === EmptyList) {
                return Acc;
            }
            debug(`F(${util.inspect(L.value)},${util.inspect(Acc)})`);
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

    export function map(o: any) {
        return "#{"
            + Object.keys(o)
                .map(k => util.inspect(k) + " => " + util.inspect(o[k]))
                .join(",")
            + "}";
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

export function array_to_list(Arr: any[]) {
    const res = Arr.reduce((acc, c) => acc.append(c), EmptyList);
    return lists.reverse(res);
}

export function list_to_array(list: List): any[] {
    const res = [];
    lists.walk(list, x => res.push(x));
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

export function string_to_array(str: string): Uint8Array {
    return Uint8Array.from(new Array(str.length), (v, k) => str.charCodeAt(k));
}

export function string_to_binary(str: string): Binary {
    return new Binary(string_to_array(str));
}

export type IOList = List;

export function integer_to_iolist(x: int): IOList {
    assert(type_of(x) == "int", "expect integer: " + util.inspect(x));
    if (x == 0) {
        return EmptyList.append(48);
    }
    let acc = EmptyList;
    let neg = false;
    if (x < 0) {
        neg = true;
        x = -x;
    }
    for (; x != 0;) {
        const rem = x % 10;
        acc = acc.append(rem + 48);
        x = (x - rem) / 10;
    }
    return neg ? acc.append(char_code["-"]) : acc;
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
    if (Data instanceof List) {
        return "list";
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
export function iolist_to_binary(List0: List): Binary {
    const List1 = iolist_to_binary_walk(List0, []);
    // debug("List1=" + util.inspect(List1));
    const Bin = Uint8Array.from(List1);
    // debug("Bin=" + util.inspect(Bin));
    return new Binary(Bin);
}

export function iolist_to_binary_walk(list: IOList, acc: number[]): number[] {
    if (list == EmptyList) {
        return acc;
    }
    const type = type_of(list.value);
    switch (type) {
        case "binary":
            (list.value as Binary).value.forEach(x => acc.push(x));
            break;
        case "list":
            iolist_to_binary_walk(list.value as IOList, acc);
            break;
        case "string":
            const n = list.value.length;
            for (let i = 0; i < n; i++) {
                acc.push((list.value as string).charCodeAt(i));
            }
            break;
        default:
            const v = list.value;
            if (0 <= v && v <= 255) {
                acc.push(v);
                break;
            }
            debug(`iolist_to_binary_walk(${util.inspect(list)},${util.inspect(acc)}) on unknown data type: ${type}`);
            acc.push(v);
    }
    return iolist_to_binary_walk(list.tail, acc);
}

export function binary_to_list(Bin: Binary): List {
    // debug(`binary_to_list(${util.inspect(Bin)})`);
    const res = Bin.value.reduce((acc, c) => acc.append(c), EmptyList);
    return lists.reverse(res);
}

export function byte_size(Bin: Binary): number {
    return Bin.value.byteLength;
}

export type float = number;
export type int = number;
export type atom = symbol;
export type map = Map<any, any>;

export function equal(A, B): boolean {
    const A_Type = type_of(A);
    const B_Type = type_of(B);
    if (A_Type != B_Type) {
        if ((A_Type == "array" && B_Type == "list")
            || (A_Type == "list" && B_Type == "array")) {
            if (B_Type == "array") {
                [B, A] = swap(A, B);
            }
            let B_Head = (B as List).value;
            let B_Tail = (B as List).tail;
            const All = (A as any[]).every(A_Head => {
                if (equal(A_Head, B_Head)) {
                    B_Head = B_Tail.value;
                    B_Tail = B_Tail.tail;
                    return true;
                }
                return false;
            });
            return All && B_Tail == EmptyList; // or b tail equal to undefined?
        }
        return false;
    }
    switch (A_Type) {
        case "array":
            return A.length == B.length && (A as any[]).every((a, i) => equal(a, B[i]));
        case "list":
            return list_equal(A, B);
        default:
            return A == B;
    }
}

export function list_equal(List_A: List, List_B: List): boolean {
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