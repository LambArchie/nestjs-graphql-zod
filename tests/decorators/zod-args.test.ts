import 'reflect-metadata'
import { describe, it, expect, afterEach } from 'vitest'
import { z } from 'zod'
import { LazyMetadataStorage } from '@nestjs/graphql/dist/schema-builder/storages/lazy-metadata.storage'
import { TypeMetadataStorage } from '@nestjs/graphql/dist/schema-builder/storages/type-metadata.storage'
import { ZodArgs } from '../../src/decorators/input-type/zod-args'

describe('ZodArgs', () => {
  afterEach(() => {
    ZodArgs.free()
  })

  it('should create a parameter decorator for a string schema', () => {
    const decorator = ZodArgs(z.string(), 'name', {})
    expect(typeof decorator).toBe('function')
  })

  it('should create a parameter decorator for a number schema', () => {
    const decorator = ZodArgs(z.number(), 'count', {})
    expect(typeof decorator).toBe('function')
  })

  it('should create a parameter decorator for an object schema', () => {
    const schema = z
      .object({
        name: z.string(),
        age: z.number(),
      })
      .describe('ArgsInput: test args')

    const decorator = ZodArgs(schema, 'input', {})
    expect(typeof decorator).toBe('function')
  })

  it('should handle decorator with just schema', () => {
    const decorator = ZodArgs(z.string())
    expect(typeof decorator).toBe('function')
  })

  it('should handle decorator with name parameter', () => {
    const decorator = ZodArgs(z.string(), 'myArg')
    expect(typeof decorator).toBe('function')
  })

  it('should handle an array of objects schema', () => {
    const schema = z
      .array(z.object({ label: z.string(), count: z.number() }).describe('Item: an item'))
      .describe('Items: a list of items')

    const decorator = ZodArgs(schema, 'items', {})
    expect(typeof decorator).toBe('function')
  })

  it('should handle an array of objects with enums without generating __ prefixed names', () => {
    // GraphQL reserves names starting with "__" for introspection. Enum names are
    // built as "{parent}_{field}Enum_{n}", so the parent name must never be "_"
    // or empty — otherwise the enum name starts with "__".
    const enumsBefore = TypeMetadataStorage.getEnumsMetadata().length

    const schema = z.array(
      z
        .object({
          name: z.string(),
          role: z.enum(['admin', 'member']).describe('Role: user role'),
        })
        .describe('Member: a team member'),
    )
    ZodArgs(schema, 'members', {})

    // NestJS defers enum registration via LazyMetadataStorage — flush it so we
    // can inspect the names that were actually registered.
    LazyMetadataStorage.load([])
    const newEnums = TypeMetadataStorage.getEnumsMetadata().slice(enumsBefore)
    expect(newEnums).toHaveLength(1)
    expect(newEnums[0].name).not.toMatch(/^__/)
    expect(newEnums[0].name).toMatch(/^Member_RoleEnum_/)
  })

  it('should handle a bare enum schema', () => {
    const enumsBefore = TypeMetadataStorage.getEnumsMetadata().length

    const decorator = ZodArgs(
      z.enum(['asc', 'desc']).describe('SortOrder: sorting direction'),
      'sortOrder',
    )
    expect(typeof decorator).toBe('function')

    LazyMetadataStorage.load([])
    const newEnums = TypeMetadataStorage.getEnumsMetadata().slice(enumsBefore)
    expect(newEnums).toHaveLength(1)
    expect(newEnums[0].name).not.toMatch(/^__/)
  })

  it('should handle an optional array of enum values (z.keyof)', () => {
    const TestSchema = z.object({
      name: z.string(),
      age: z.number(),
    })
    const enumsBefore = TypeMetadataStorage.getEnumsMetadata().length

    const decorator = ZodArgs(z.array(z.keyof(TestSchema)).optional(), 'SelectedFields')
    expect(typeof decorator).toBe('function')

    LazyMetadataStorage.load([])
    const newEnums = TypeMetadataStorage.getEnumsMetadata().slice(enumsBefore)
    expect(newEnums).toHaveLength(1)
    expect(newEnums[0].name).not.toMatch(/^__/)
  })

  it('should free internal state', () => {
    const schema = z.object({ x: z.string() }).describe('FreeTest: test')
    ZodArgs(schema, 'input', {})
    ZodArgs.free()
    const decorator = ZodArgs(schema, 'input', {})
    expect(typeof decorator).toBe('function')
  })
})

describe('ZodArgs.Of', () => {
  it('should be a type-level utility (just verify it compiles)', () => {
    type Result = ZodArgs.Of<z.ZodString>
    const _check: Result = 'hello'
    expect(_check).toBe('hello')
  })
})
